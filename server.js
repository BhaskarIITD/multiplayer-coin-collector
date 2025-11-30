// server.js 

const express = require('express');
const app = express();
const port = 3000;

const server = app.listen(port, () => {
  console.log(`Game is running on http://localhost:${port}`);
});
const io = require('socket.io')(server);

// -------------------- Game state & constants --------------------
const CANVAS_W = 800;
const CANVAS_H = 600;

let players = {};
let stateVersion = 0;    
let pausedUntil = 0;     

// coins array: can hold multiple coins { id, x, y }
let coins = [];
let nextCoinSpawn = Date.now();       
const COIN_RESPAWN_INTERVAL = 3000;   // 3 seconds

// sizes used for collision checks
const COIN_RADIUS = 10;
const PLAYER_RADIUS = 15;

// winning score
const WIN_SCORE = 5;

// -------------------- Lag helpers --------------------
function emitWithLag(socketObj, event, data, delay = 200) {
  setTimeout(() => {
    try { socketObj.emit(event, data); } catch (e) { /* ignore */ }
  }, delay);
}
function broadcastWithLag(ioObj, event, data, delay = 200) {
  setTimeout(() => {
    try { ioObj.emit(event, data); } catch (e) { /* ignore */ }
  }, delay);
}

// -------------------- Utilities --------------------
function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}
function randomPosition(margin = 30) {
  return {
    x: Math.floor(Math.random() * (CANVAS_W - 2 * margin)) + margin,
    y: Math.floor(Math.random() * (CANVAS_H - 2 * margin)) + margin
  };
}
function randomCoinPosition() {
  const margin = 20;
  return {
    x: Math.floor(Math.random() * (CANVAS_W - 2 * margin)) + margin,
    y: Math.floor(Math.random() * (CANVAS_H - 2 * margin)) + margin
  };
}
// produce a coin not too close to players
function spawnCoinAwayFromPlayers(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const c = randomCoinPosition();
    let tooClose = false;
    for (const id in players) {
      const p = players[id];
      if (!p || !p.position) continue;
      const dx = c.x - p.position.x;
      const dy = c.y - p.position.y;
      if (dx*dx + dy*dy < Math.pow(PLAYER_RADIUS + COIN_RADIUS + 20, 2)) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return c;
  }
  return randomCoinPosition();
}

// each coin needs an id so clients can reference them reliably
let nextCoinId = 1;
function makeNewCoin() {
  const pos = spawnCoinAwayFromPlayers();
  return { id: `coin${nextCoinId++}`, x: pos.x, y: pos.y };
}

// -------------------- Static files --------------------
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// -------------------- Connection handling --------------------
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  players[socket.id] = {
    id: socket.id,
    color: randomColor(),
    position: randomPosition(),
    score: 0
  };

  emitWithLag(socket, 'currentPlayers', { players, coins, version: stateVersion });

  // announce new player
  broadcastWithLag(io, 'newPlayer', players[socket.id]);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    broadcastWithLag(io, 'playerDisconnected', socket.id);
  });

  socket.on('input', (data) => {
    // lobby: don't allow movement until 2 players
    if (Object.keys(players).length < 2) return;

    const player = players[socket.id];
    if (!player) return;

    const speed = 5;
    switch (data.dir) {
      case 'up':    player.position.y = Math.max(player.position.y - speed, 0); break;
      case 'down':  player.position.y = Math.min(player.position.y + speed, CANVAS_H); break;
      case 'left':  player.position.x = Math.max(player.position.x - speed, 0); break;
      case 'right': player.position.x = Math.min(player.position.x + speed, CANVAS_W); break;
    }
    // do not broadcast here; main tick handles authoritative snapshots
  });
});

// -------------------- Reset --------------------
function resetGame() {
  console.log('Resetting game — bumping version and repositioning players.');

  stateVersion++;

  // reset players
  for (const id in players) {
    players[id].score = 0;
    players[id].position = randomPosition();
  }

  // clear coins and restart schedule; first spawn at next interval
  coins = [];
  nextCoinSpawn = Date.now() + COIN_RESPAWN_INTERVAL;


  try {
    io.emit('gameReset', { players, coins, version: stateVersion });
    io.emit('state', { players, coins, version: stateVersion });
  } catch (e) { /* ignore */ }

  pausedUntil = Date.now() + 600;
}

// -------------------- Main tick (30 Hz) --------------------
setInterval(() => {
  const pickupThresholdSq = Math.pow(PLAYER_RADIUS + COIN_RADIUS, 2);

  // 1) Collision detection: check each coin for each player
  // Iterate players, then iterate coins; if player picks a coin, award score & remove that coin
  for (const id in players) {
    const p = players[id];
    if (!p || !p.position) continue;

    // check coins array
    for (let ci = 0; ci < coins.length; ci++) {
      const c = coins[ci];
      const dx = p.position.x - c.x;
      const dy = p.position.y - c.y;
      const dist2 = dx*dx + dy*dy;

      if (dist2 <= pickupThresholdSq) {
        // pickup
        p.score = (p.score || 0) + 1;
        console.log(`Player ${id} picked up coin ${c.id}. New score: ${p.score}`);

        // remove the coin that was picked
        coins.splice(ci, 1);
        // adjust index to continue correctly if needed (we break out)
        ci--;

        // WIN CHECK
        if (p.score >= WIN_SCORE) {
          console.log(`Player ${id} reached winning score — announcing now`);
          io.emit('gameOver', { winner: id });
          setTimeout(() => resetGame(), 1200);
          return; 
        }
        break;
      }
    }
  }

  // Scheduled coin spawns
  const now = Date.now();
  while (now >= nextCoinSpawn) {
    const newCoin = makeNewCoin();
    coins.push(newCoin);
    broadcastWithLag(io, 'state', { players, coins, version: stateVersion });
    console.log('Scheduled spawn:', newCoin.id, newCoin.x, newCoin.y);
    nextCoinSpawn += COIN_RESPAWN_INTERVAL;
  }

  // Broadcast authoritative state
  if (Date.now() >= pausedUntil) {
    broadcastWithLag(io, 'state', { players, coins, version: stateVersion });
  }

}, 1000 / 30); // ~30 Hz

// -------------------- Initial coin spawn --------------------

coins.push(makeNewCoin());
nextCoinSpawn = Date.now() + COIN_RESPAWN_INTERVAL;

console.log('Server started. Initial coin(s) spawned:', coins.length);
