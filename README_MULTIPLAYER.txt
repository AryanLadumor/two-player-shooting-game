3D SHOOTER — TWO-PLAYER PRIVATE ROOM MVP
========================================

WHAT'S INCLUDED
- 3d_fbx_character_controller_right_hand.html: the existing game plus private-room panel, remote player rendering, and multiplayer health/lives HUD.
- server.js: Node.js + Socket.IO room server (maximum two players per room).
- package.json: server dependencies.

MULTIPLAYER FEATURES
- Create a private six-character room code and join from a second browser/computer.
- Synchronize player position, facing direction, combat mode, and basic movement state.
- Players start with the pistol; press 1 for pistol or 2 for the full-auto gun. Hold left click to fire.
- Show the other player's character and bullet tracers.
- Both players have 100 health. Hits deal 25 damage (4 hits per life); the auto gun fires faster than the pistol.
- Each time a player's health reaches zero, their death count increases and they respawn with full health.
- The first player to reach 3 deaths loses; the opponent wins. The server tracks health/deaths and checks shot lines against the opponent's latest reported position.
- Health bars, health numbers, deaths out of 3, and a win/lose message appear in the multiplayer HUD.

RUN LOCALLY
1. Install Node.js 18 or newer from https://nodejs.org/ if it is not already installed.
2. Keep these files together in one folder.
3. Open a terminal/PowerShell in that folder.
4. Run: npm install
5. Run: npm start
6. Open http://localhost:3000. The server serves the game at `/`.
7. Click Create room and share the six-character code with Player 2.

TEST ON TWO COMPUTERS ON THE SAME WI-FI
1. Run the server on the host computer.
2. Find the host computer's LAN IPv4 address (Windows: run `ipconfig` and look for IPv4 Address).
3. On the second computer, open http://HOST-LAN-IP:3000 (replace HOST-LAN-IP with the actual address).
4. If Windows Firewall asks, allow Node.js on your Private network.
5. Player 1 creates a room; Player 2 enters the code and clicks Join.

IMPORTANT LIMITATIONS
- This is a playable prototype, not a finished competitive shooter. Hit detection is server-checked against client-reported shot lines and latest client-reported positions; it is not a fully authoritative physics simulation.
- Movement and remote character animation synchronization remain basic. Uploaded custom FBX models are not automatically shared.
- For friends on different networks, deploy the Node server to a public host or configure a secure tunnel/port forwarding later.
- Three.js, Tailwind, and Font Awesome are loaded from CDNs, so the game needs internet access for those libraries.
