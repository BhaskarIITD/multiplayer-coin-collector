Multiplayer Coin Collector – Assignment Submission

This repository contains my implementation of the Krafton Associate Game Developer Assignment.
The project is a fully server-authoritative multiplayer game built using Node.js and Socket.IO, featuring scheduled coin spawning, simulated latency, smooth interpolation, and automatic game resets.

⚙️ Features
1. Server-Authoritative Architecture

Clients send only movement intent.

Server computes movement, collisions, scoring, coin pickups, and resets.

Prevents cheating and ensures deterministic gameplay.

2. Simulated Network Lag

All server-to-client state packets are artificially delayed by 200 ms.

Client interpolation ensures smooth visuals even under lag.

3. Client-Side Interpolation

Player movement is smoothed from (currentX, currentY) → (targetX, targetY).

Greatly reduces jitter when network latency spikes.

4. Multiple Coin Spawning (Every 3 Seconds)

A new coin is spawned every 3 seconds, regardless of how many coins are already on the field.

Existing coins remain until collected.

Safe spawn logic avoids spawning directly on top of players.

5. Win Condition + Automatic Reset

First player to reach 5 points wins.

All players are notified.

Game automatically resets:

Scores reset

Player positions randomized

All coins cleared

Spawn schedule restarted

6. Clean User Interface

Scoreboard aligned on the left

Game rules panel for instructions

Game canvas on the right

Local player highlighted in yellow

Minimalistic and readable design

🎮 Gameplay Rules

Move using W A S D

A new coin spawns every 3 seconds

Collect coins by touching them

Each coin gives 1 point

First to 5 points wins

Game resets automatically after a win

📦 How to Run Locally
1. Install dependencies
npm install

2. Start the server
node server.js

3. Open the game

Navigate to:

http://localhost:3000

4. Connect multiple players

Open multiple tabs/windows.
Movement only starts once 2+ players have joined.

📁 Project Structure
├── server.js          (Authoritative game logic)
├── client.js          (Rendering, interpolation, socket handling)
├── index.html         (UI structure)
├── styles.css         (Styling)
├── package.json
└── README.md

📌 Assumptions Made

Game logic activates only when two or more players are present.

Canvas resolution is fixed at 800×600 for consistent collision detection.

Coins remain active until collected.

No authentication system; each browser tab is a unique player.

❗ Important Note on Player Shapes

The problem statement suggests using different shapes for different players.

In this implementation, all players have square shapes.

Reason:
Accurate authoritative collision detection across multiple geometric shapes (triangles, circles, squares, cubes etc) adds too much complexity and is difficult to achieve in the given time constraints.
Uniform square players provide:

deterministic collision checks

fair gameplay

consistent visual clarity
