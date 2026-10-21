const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
});

const PORT = Number(process.env.PORT) || 3000;
const rooms = new Map(); // code -> Map(socketId, latestState)
const socketRooms = new Map(); // socketId -> code
const matchStates = new Map(); // code -> { players: Map(socketId, { health, deaths }), finished }
const lastShotAt = new Map();
const MAX_DEATHS = 3;
const MAX_HEALTH = 100;
const SHOT_DAMAGE = 25;

app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '3d_shooter_game.html'));
});

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomPlayers(code) {
  const room = rooms.get(code);
  if (!room) return [];
  return [...room.keys()].map(id => ({ id }));
}

function publicMatchState(code, winnerId = null, loserId = null) {
  const match = matchStates.get(code);
  if (!match) return null;
  return {
    players: [...match.players.entries()].map(([id, stats]) => ({ id, health: stats.health, deaths: stats.deaths })),
    maxHealth: MAX_HEALTH, maxDeaths: MAX_DEATHS, winnerId, loserId, finished: match.finished
  };
}

function emitMatchState(code, winnerId = null, loserId = null) {
  const state = publicMatchState(code, winnerId, loserId);
  if (state) io.to(code).emit('match-update', state);
}

function pointSegmentDistanceSquared(point, start, end) {
  const vx = end[0] - start[0], vy = end[1] - start[1], vz = end[2] - start[2];
  const wx = point[0] - start[0], wy = point[1] - start[1], wz = point[2] - start[2];
  const lenSq = vx*vx + vy*vy + vz*vz;
  const t = lenSq ? Math.max(0, Math.min(1, (wx*vx + wy*vy + wz*vz) / lenSq)) : 0;
  const dx = start[0] + t*vx - point[0], dy = start[1] + t*vy - point[1], dz = start[2] + t*vz - point[2];
  return dx*dx + dy*dy + dz*dz;
}

function shotHitsPlayer(shot, state) {
  if (!state) return false;
  const sampleHeights = [0.45, 0.9, 1.35, 1.7];
  const radiusSq = 0.62 * 0.62;
  return sampleHeights.some(height =>
    pointSegmentDistanceSquared([state.x, state.y + height, state.z], shot.start, shot.end) <= radiusSq
  );
}

function publishPlayers(code, event) {
  const players = roomPlayers(code);
  io.to(code).emit(event, { players });
}

function leaveRoom(socket) {
  const code = socketRooms.get(socket.id);
  if (!code) return;
  socket.leave(code);
  socketRooms.delete(socket.id);
  const room = rooms.get(code);
  if (room) {
    room.delete(socket.id);
    const match = matchStates.get(code);
    if (match) match.players.delete(socket.id);
    if (room.size === 0) { rooms.delete(code); matchStates.delete(code); }
    else { publishPlayers(code, 'player-left'); emitMatchState(code); }
  }
  lastShotAt.delete(socket.id);
}

io.on('connection', socket => {
  socket.on('create-room', () => {
    leaveRoom(socket);
    const code = makeCode();
    rooms.set(code, new Map([[socket.id, null]]));
    matchStates.set(code, { players: new Map([[socket.id, { health: MAX_HEALTH, deaths: 0 }]]), finished: false });
    socketRooms.set(socket.id, code);
    socket.join(code);
    socket.emit('room-created', { code, players: roomPlayers(code) });
  });

  socket.on('join-room', payload => {
    const code = String(payload?.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit('room-error', { message: 'Room not found. Check the code and try again.' });
    if (room.size >= 2 && !room.has(socket.id)) return socket.emit('room-error', { message: 'This room already has two players.' });
    leaveRoom(socket);
    const currentRoom = rooms.get(code);
    if (!currentRoom || currentRoom.size >= 2) return socket.emit('room-error', { message: 'This room is full or no longer exists.' });
    currentRoom.set(socket.id, null);
    const match = matchStates.get(code) || { players: new Map(), finished: false };
    match.players.set(socket.id, { health: MAX_HEALTH, deaths: 0 });
    matchStates.set(code, match);
    socketRooms.set(socket.id, code);
    socket.join(code);
    socket.emit('room-joined', { code, players: roomPlayers(code) });
    publishPlayers(code, 'player-joined');
    emitMatchState(code);
  });

  socket.on('player-state', state => {
    const code = socketRooms.get(socket.id);
    if (!code || !rooms.has(code) || !state || typeof state !== 'object') return;
    const safeState = {
      id: socket.id,
      x: clampNumber(state.x, -1000, 1000),
      y: clampNumber(state.y, -20, 100),
      z: clampNumber(state.z, -1000, 1000),
      rotationY: clampNumber(state.rotationY, -100000, 100000),
      mode: state.mode === 'auto' ? 'auto' : 'pistol',
    };
    rooms.get(code).set(socket.id, safeState);
    socket.to(code).emit('player-state', safeState);
  });

  socket.on('player-shot', shot => {
    const code = socketRooms.get(socket.id);
    if (!code || !rooms.has(code) || !shot) return;
    const validVector = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 2000);
    if (!validVector(shot.start) || !validVector(shot.end)) return;
    socket.to(code).emit('player-shot', {
      id: socket.id,
      start: shot.start.map(Number),
      end: shot.end.map(Number),
      mode: shot.mode === 'auto' ? 'auto' : 'pistol',
    });

    if (shot.mode !== 'pistol' && shot.mode !== 'auto') return;
    const now = Date.now();
    if (now - (lastShotAt.get(socket.id) || 0) < 90) return;
    lastShotAt.set(socket.id, now);
    const room = rooms.get(code);
    const match = matchStates.get(code);
    if (!room || !match || match.finished || room.size !== 2) return;
    const shooterState = room.get(socket.id);
    const opponentId = [...room.keys()].find(id => id !== socket.id);
    const opponentState = room.get(opponentId);
    const opponentStats = match.players.get(opponentId);
    if (!shooterState || !opponentState || !opponentStats || opponentStats.health <= 0) return;
    if (!shotHitsPlayer({ start: shot.start.map(Number), end: shot.end.map(Number) }, opponentState)) return;

    opponentStats.health = Math.max(0, opponentStats.health - SHOT_DAMAGE);
    if (opponentStats.health === 0) {
      opponentStats.deaths += 1;
      if (opponentStats.deaths >= MAX_DEATHS) {
        match.finished = true;
        emitMatchState(code, socket.id, opponentId);
        io.to(code).emit('match-over', { winnerId: socket.id, loserId: opponentId, maxDeaths: MAX_DEATHS });
        return;
      }
      opponentStats.health = MAX_HEALTH;
      const safeSpawns = [[0, 0, 0], [3, 0, 3]];
      const spawn = safeSpawns[[...room.keys()].indexOf(opponentId)] || [0, 0, 0];
      opponentState.x = spawn[0]; opponentState.y = spawn[1]; opponentState.z = spawn[2];
      room.set(opponentId, opponentState);
      io.to(code).emit('player-respawn', { id: opponentId, x: spawn[0], y: spawn[1], z: spawn[2] });
    }
    emitMatchState(code);
  });

  socket.on('leave-room', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer game server listening on http://localhost:${PORT}`);
});