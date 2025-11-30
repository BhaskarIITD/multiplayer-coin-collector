// client.js

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const PLAYER_W = 30;
const PLAYER_H = 30;
const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;

// frontendPlayers maps socketId -> player visual state:
// { currentX, currentY, targetX, targetY, color, score }
let frontendPlayers = {};
let frontendCoins = []; // { x, y }

const socket = io();

// ---------- lagged emit helper (keeps your Phase 3 Part 1 behavior) ----------
function emitWithLag(socketObj, event, data) {
  setTimeout(() => {
    socketObj.emit(event, data);
  }, 200); // 200 ms one-way delay
}

// ---------- connection handlers ----------
socket.on('connect', () => {
  document.getElementById('status').innerText = `Connected as Player: ${socket.id}`;
});

socket.on('disconnect', () => {
  document.getElementById('status').innerText = 'Disconnected';
});

socket.on('gameOver', ({ winner }) => {
  alert(`${winner === socket.id ? 'You' : winner.substring(0,4)} won the game!`);
});

socket.on('gameReset', (payload) => {
  const { players, coins } = payload;

  frontendCoins = coins || [];
  frontendPlayers = {};

  // Reinitialize current/target for smooth interpolation
  for (const id in players) {
    const p = players[id];
    frontendPlayers[id] = {
      currentX: p.position.x,
      currentY: p.position.y,
      targetX: p.position.x,
      targetY: p.position.y,
      color: p.color,
      score: p.score
    };
  }

  console.log("Game has been reset.");
});



// Server emits 'state' with the authoritative players object
socket.on('state', (payload) => {
  const players = payload.players;   // authoritative players
  const coins    = payload.coins;      // authoritative coin

  frontendCoins = coins || [];
  // players is the authoritative object keyed by socket.id
  // Update frontendPlayers: set target positions for smoothing
  for (const id in players) {
    const p = players[id];
    if (!p || !p.position) continue;

    if (!frontendPlayers[id]) {
      // New player: initialize current and target to server position to avoid snap
      frontendPlayers[id] = {
        currentX: p.position.x,
        currentY: p.position.y,
        targetX: p.position.x,
        targetY: p.position.y,
        color: p.color || '#ffffff',
        score: p.score || 0
      };
    } else {
      // Existing: update only the target (authoritative)
      frontendPlayers[id].targetX = p.position.x;
      frontendPlayers[id].targetY = p.position.y;
      // update meta
      frontendPlayers[id].color = p.color || frontendPlayers[id].color;
      frontendPlayers[id].score = p.score ?? frontendPlayers[id].score;
    }
  }

  // Remove any frontend entries that the server no longer reports (disconnected)
  for (const id in frontendPlayers) {
    if (!players[id]) {
      delete frontendPlayers[id];
    }
  }
});

// Optional: handle initial snapshot or events if server sends them
socket.on('currentPlayers', (payload) => {
  // initialize all from authoritative snapshot
  const players = payload.players;
  const coins   = payload.coins;

  frontendCoins = coins || [];
  frontendPlayers = {};

  for (const id in players) {
    const p = players[id];
    frontendPlayers[id] = {
      currentX: p.position.x,
      currentY: p.position.y,
      targetX: p.position.x,
      targetY: p.position.y,
      color: p.color || '#ffffff',
      score: p.score || 0
    };
  }
});
socket.on('newPlayer', (p) => {
  if (!p || !p.position) return;
  frontendPlayers[p.id] = {
    currentX: p.position.x,
    currentY: p.position.y,
    targetX: p.position.x,
    targetY: p.position.y,
    color: p.color || '#ffffff',
    score: p.score || 0
  };
});
socket.on('playerDisconnected', (id) => {
  delete frontendPlayers[id];
});

// ---------- input (intent only) ----------
document.addEventListener('keydown', (event) => {
  let direction = null;
  switch (event.key) {
    case 'ArrowUp': case 'w': case 'W': direction = 'up'; break;
    case 'ArrowDown': case 's': case 'S': direction = 'down'; break;
    case 'ArrowLeft': case 'a': case 'A': direction = 'left'; break;
    case 'ArrowRight': case 'd': case 'D': direction = 'right'; break;
  }
  if (direction) emitWithLag(socket, 'input', { dir: direction });
});

// ---------- rendering + interpolation ----------

function clearCanvas() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawCoins() {
  for (const c of frontendCoins) {
    ctx.beginPath();
    ctx.fillStyle = '#FFD700';  // ← MOVE THIS INSIDE THE LOOP
    ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

// improved drawScoreboard + gameLoop

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw the scoreboard on TOP of everything (call this after drawing players)
function updateScoreboard() {
  const board = document.getElementById('scoreboard');

  // Build scoreboard HTML
  const entries = Object.keys(frontendPlayers);
  let html = `<div class="title">Scores</div>`;

  // sort entries optionally by score descending (nice)
  entries.sort((a, b) => (frontendPlayers[b].score || 0) - (frontendPlayers[a].score || 0));

  for (const id of entries) {
    const p = frontendPlayers[id];
    const name = id === socket.id ? 'You' : id.substring(0, 4);
    const score = p.score ?? 0;

    html += `
      <div class="score-row">
        <div class="name">${escapeHtml(name)}</div>
        <div class="val">${score}</div>
      </div>
    `;
  }

  board.innerHTML = html;
}

// tiny helper to avoid HTML injection if ids are weird
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}


function updateAndDrawPlayers() {
  // alpha controls smoothing: 0.1 is a good default for 200ms one-way
  const alpha = 0.1;

  for (const id in frontendPlayers) {
    const p = frontendPlayers[id];

    // Interpolate current toward target
    p.currentX = p.currentX + (p.targetX - p.currentX) * alpha;
    p.currentY = p.currentY + (p.targetY - p.currentY) * alpha;

    // Draw rectangle centered at currentX/currentY
    const drawX = Math.round(p.currentX - PLAYER_W / 2);
    const drawY = Math.round(p.currentY - PLAYER_H / 2);

    ctx.fillStyle = p.color || '#ffffff';
    ctx.fillRect(drawX, drawY, PLAYER_W, PLAYER_H);

    // Label and highlight local player
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    const label = id === socket.id ? 'You' : id.substring(0, 4);
    ctx.fillText(`${label} (${p.score ?? 0})`, Math.round(p.currentX), drawY - 6);

    if (id === socket.id) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX, drawY, PLAYER_W, PLAYER_H);
    }
  }
}

function gameLoop() {
  clearCanvas();
  drawCoins();
  updateAndDrawPlayers();
  updateScoreboard();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
