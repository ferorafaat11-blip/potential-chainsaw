const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let state = {
  type: 'video', url: '', degree: 0,
  playing: false, startedAt: null, pausedAt: 0,
  volume: 1, muted: false,
};

let viewers = 0;

io.on('connection', (socket) => {
  viewers++;
  io.emit('viewers', viewers);
  socket.emit('state', { ...state, serverTime: Date.now() });

  socket.on('disconnect', () => { viewers--; io.emit('viewers', viewers); });

  socket.on('play', (data) => {
    if (data?.url)    state.url    = data.url;
    if (data?.type)   state.type   = data.type;
    if (data?.degree  !== undefined) state.degree  = data.degree;
    if (data?.volume  !== undefined) state.volume  = data.volume;
    if (data?.muted   !== undefined) state.muted   = data.muted;
    state.playing   = true;
    state.startedAt = Date.now() - (state.pausedAt * 1000);
    io.emit('state', { ...state, serverTime: Date.now() });
  });

  socket.on('pause', () => {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', { ...state, serverTime: Date.now() });
  });

  socket.on('restart', (data) => {
    if (data?.url)    state.url    = data.url;
    if (data?.type)   state.type   = data.type;
    if (data?.degree  !== undefined) state.degree  = data.degree;
    if (data?.volume  !== undefined) state.volume  = data.volume;
    if (data?.muted   !== undefined) state.muted   = data.muted;
    state.playing   = true;
    state.pausedAt  = 0;
    state.startedAt = Date.now();
    io.emit('state', { ...state, serverTime: Date.now() });
  });

  socket.on('show', (data) => {
    state.url     = data.url;
    state.type    = data.type;
    if (data?.degree  !== undefined) state.degree  = data.degree;
    if (data?.volume  !== undefined) state.volume  = data.volume;
    if (data?.muted   !== undefined) state.muted   = data.muted;
    state.playing   = true;
    state.startedAt = Date.now();
    state.pausedAt  = 0;
    io.emit('state', { ...state, serverTime: Date.now() });
  });

  socket.on('seek', (data) => {
    state.pausedAt  = data.seconds;
    state.startedAt = Date.now() - (data.seconds * 1000);
    io.emit('state', { ...state, serverTime: Date.now() });
  });

  socket.on('setVolume', (data) => {
    if (data?.volume !== undefined) state.volume = data.volume;
    if (data?.muted  !== undefined) state.muted  = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  // الأجهزة بتبعت مدة الفيديو للـ host
  socket.on('reportDuration', (data) => {
    socket.broadcast.emit('videoDuration', data);
  });

  socket.on('syncAll', () => {
    io.emit('sync', { ...state, serverTime: Date.now() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
