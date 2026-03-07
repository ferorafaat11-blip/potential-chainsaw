const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// كل room ليها state خاص بيها
const rooms = {}; // { "42": { state, viewers } }

function createRoom() {
  // كود رقمين عشوائي مش موجود
  let code;
  do { code = String(Math.floor(10 + Math.random() * 90)); } while (rooms[code]);
  rooms[code] = {
    code,
    state: { type:'video', url:'', degree:0, playing:false, startedAt:null, pausedAt:0, volume:1, muted:false },
    viewers: 0,
  };
  return code;
}

function getRoomByHost(socketId) {
  return Object.values(rooms).find(r => r.hostId === socketId);
}

io.on('connection', (socket) => {

  // ===== HOST: إنشاء room =====
  socket.on('createRoom', () => {
    const code = createRoom();
    rooms[code].hostId = socket.id;
    socket.join('host:' + code);
    socket.emit('roomCreated', { code });
  });

  // ===== HOST: أوامر التحكم =====
  function getHostRoom() {
    return Object.values(rooms).find(r => r.hostId === socket.id);
  }

  function broadcastState(room) {
    io.to('room:' + room.code).emit('state', { ...room.state, serverTime: Date.now() });
    io.to('host:' + room.code).emit('viewers', room.viewers);
  }

  socket.on('play', (data) => {
    const room = getHostRoom(); if (!room) return;
    if (data?.url)    room.state.url    = data.url;
    if (data?.type)   room.state.type   = data.type;
    if (data?.degree  !== undefined) room.state.degree  = data.degree;
    if (data?.volume  !== undefined) room.state.volume  = data.volume;
    if (data?.muted   !== undefined) room.state.muted   = data.muted;
    room.state.playing   = true;
    room.state.startedAt = Date.now() - (room.state.pausedAt * 1000);
    broadcastState(room);
  });

  socket.on('pause', () => {
    const room = getHostRoom(); if (!room) return;
    if (room.state.startedAt) room.state.pausedAt = (Date.now() - room.state.startedAt) / 1000;
    room.state.playing = false;
    broadcastState(room);
  });

  socket.on('restart', (data) => {
    const room = getHostRoom(); if (!room) return;
    if (data?.url)    room.state.url    = data.url;
    if (data?.type)   room.state.type   = data.type;
    if (data?.degree  !== undefined) room.state.degree  = data.degree;
    if (data?.volume  !== undefined) room.state.volume  = data.volume;
    if (data?.muted   !== undefined) room.state.muted   = data.muted;
    room.state.playing   = true;
    room.state.pausedAt  = 0;
    room.state.startedAt = Date.now();
    broadcastState(room);
  });

  socket.on('show', (data) => {
    const room = getHostRoom(); if (!room) return;
    room.state.url  = data.url;
    room.state.type = data.type;
    if (data?.degree !== undefined) room.state.degree = data.degree;
    if (data?.volume !== undefined) room.state.volume = data.volume;
    if (data?.muted  !== undefined) room.state.muted  = data.muted;
    room.state.playing   = true;
    room.state.startedAt = Date.now();
    room.state.pausedAt  = 0;
    broadcastState(room);
  });

  socket.on('seek', (data) => {
    const room = getHostRoom(); if (!room) return;
    room.state.pausedAt  = data.seconds;
    room.state.startedAt = Date.now() - (data.seconds * 1000);
    broadcastState(room);
  });

  socket.on('setVolume', (data) => {
    const room = getHostRoom(); if (!room) return;
    if (data?.volume !== undefined) room.state.volume = data.volume;
    if (data?.muted  !== undefined) room.state.muted  = data.muted;
    io.to('room:' + room.code).emit('setVolume', { volume: room.state.volume, muted: room.state.muted });
  });

  socket.on('syncAll', () => {
    const room = getHostRoom(); if (!room) return;
    io.to('room:' + room.code).emit('sync', { ...room.state, serverTime: Date.now() });
  });

  socket.on('startSession', () => {
    const room = getHostRoom(); if (!room) return;
    io.to('room:' + room.code).emit('sessionStart');
  });

  socket.on('stopSession', () => {
    const room = getHostRoom(); if (!room) return;
    room.state.playing = false; room.state.startedAt = null; room.state.pausedAt = 0;
    io.to('room:' + room.code).emit('sessionStop');
  });

  socket.on('closeRoom', () => {
    const room = getHostRoom(); if (!room) return;
    io.to('room:' + room.code).emit('sessionStop');
    delete rooms[room.code];
  });

  // ===== VIEWER: دخول room =====
  socket.on('joinRoom', (data) => {
    const code = String(data.code);
    const room = rooms[code];
    if (!room) { socket.emit('joinError', { msg: 'كود غلط!' }); return; }
    socket.join('room:' + code);
    socket.data.roomCode = code;
    room.viewers++;
    io.to('host:' + code).emit('viewers', room.viewers);
    socket.emit('joinOk', { code });
    socket.emit('state', { ...room.state, serverTime: Date.now() });
  });

  socket.on('reportDuration', (data) => {
    const code = socket.data.roomCode; if (!code) return;
    const room = rooms[code]; if (!room) return;
    io.to('host:' + code).emit('videoDuration', data);
  });

  // ===== Disconnect =====
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (code && rooms[code]) {
      rooms[code].viewers = Math.max(0, rooms[code].viewers - 1);
      io.to('host:' + code).emit('viewers', rooms[code].viewers);
    }
    // لو المضيف اتفصل
    const room = getRoomByHost(socket.id);
    if (room) {
      io.to('room:' + room.code).emit('sessionStop');
      delete rooms[room.code];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
