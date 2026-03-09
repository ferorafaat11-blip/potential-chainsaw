const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function createRoom() {
  let code;
  do { code = String(Math.floor(1 + Math.random() * 9)); } while (rooms[code]);
  rooms[code] = {
    code,
    hostId: null,
    state: { type:'video', url:'', degree:0, playing:false, startedAt:null, pausedAt:0, volume:1, muted:false },
    viewers: {}, // { socketId: { id, status } }
  };
  return code;
}

function getRoomViewerCount(room) {
  return Object.keys(room.viewers).length;
}

function broadcastViewers(room) {
  const list = Object.values(room.viewers);
  const count = list.length;
  io.to('host:' + room.code).emit('viewers', count);
  io.to('host:' + room.code).emit('viewerList', list);
}

function broadcastState(room) {
  io.to('room:' + room.code).emit('state', { ...room.state, serverTime: Date.now() });
  broadcastViewers(room);
}

io.on('connection', (socket) => {

  // ===== HOST: Room تتعمل أوتوماتيك =====
  socket.on('initHost', () => {
    // لو عنده room قديمة امسحها
    const old = Object.values(rooms).find(r => r.hostId === socket.id);
    if (old) delete rooms[old.code];

    const code = createRoom();
    rooms[code].hostId = socket.id;
    socket.join('host:' + code);
    socket.emit('roomReady', { code });
  });

  function getHostRoom() {
    return Object.values(rooms).find(r => r.hostId === socket.id);
  }

  // ===== أوامر التحكم =====
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
    // حدّث status كل الأجهزة
    Object.keys(room.viewers).forEach(id => {
      if (room.viewers[id]) room.viewers[id].status = 'اختيار وضع';
    });
    broadcastViewers(room);
  });

  socket.on('stopSession', () => {
    const room = getHostRoom(); if (!room) return;
    room.state.playing = false; room.state.startedAt = null; room.state.pausedAt = 0;
    io.to('room:' + room.code).emit('sessionStop');
    Object.keys(room.viewers).forEach(id => {
      if (room.viewers[id]) room.viewers[id].status = 'انتظار';
    });
    broadcastViewers(room);
  });

  // طرد كل الأجهزة من اللينك
  socket.on('kickAll', () => {
    const room = getHostRoom(); if (!room) return;
    io.to('room:' + room.code).emit('kicked');
  });

  // ===== VIEWER =====
  socket.on('autoJoin', () => {
    const firstRoom = Object.values(rooms)[0];
    if (!firstRoom) { socket.emit('noRoom'); return; }
    const code = firstRoom.code;
    socket.join('room:' + code);
    socket.data.roomCode = code;
    const num = getRoomViewerCount(firstRoom) + 1;
    firstRoom.viewers[socket.id] = { id: socket.id, num, status: 'انتظار' };
    broadcastViewers(firstRoom);
    socket.emit('joinOk');
    socket.emit('state', { ...firstRoom.state, serverTime: Date.now() });
  });

  // الجهاز بيبعت status update
  socket.on('statusUpdate', (data) => {
    const code = socket.data.roomCode; if (!code) return;
    const room = rooms[code]; if (!room) return;
    if (room.viewers[socket.id]) {
      room.viewers[socket.id].status = data.status;
      broadcastViewers(room);
    }
  });

  socket.on('reportDuration', (data) => {
    const code = socket.data.roomCode; if (!code) return;
    const room = rooms[code]; if (!room) return;
    io.to('host:' + code).emit('videoDuration', data);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (code && rooms[code]) {
      delete rooms[code].viewers[socket.id];
      broadcastViewers(rooms[code]);
    }
    const room = Object.values(rooms).find(r => r.hostId === socket.id);
    if (room) {
      io.to('room:' + room.code).emit('sessionStop');
      delete rooms[room.code];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
