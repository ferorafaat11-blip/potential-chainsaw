const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let state = {
  type:'video', url:'', degree:0,
  playing:false, startedAt:null, pausedAt:0,
  volume:1, muted:false,
  audioUrl:'', audioPlaying:false, audioStartedAt:null, audioPausedAt:0, audioVolume:1
};

let viewers = {}; // { socketId: { num, status } }
let viewerCounter = 0;

function broadcastViewers() {
  const list = Object.values(viewers);
  io.emit('viewers', list.length);
  io.emit('viewerList', list);
}

io.on('connection', (socket) => {

  // ===== HOST =====
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
    state.url  = data.url;
    state.type = data.type;
    if (data?.degree !== undefined) state.degree = data.degree;
    if (data?.volume !== undefined) state.volume = data.volume;
    if (data?.muted  !== undefined) state.muted  = data.muted;
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

  socket.on('syncAll', () => {
    io.emit('sync', { ...state, serverTime: Date.now() });
  });

  socket.on('startSession', () => {
    io.emit('sessionStart');
    Object.keys(viewers).forEach(id => { if(viewers[id]) viewers[id].status = 'اختيار وضع'; });
    broadcastViewers();
  });

  socket.on('stopSession', () => {
    state.playing = false; state.startedAt = null; state.pausedAt = 0;
    state.audioPlaying = false; state.audioStartedAt = null; state.audioPausedAt = 0;
    io.emit('sessionStop');
    Object.keys(viewers).forEach(id => { if(viewers[id]) viewers[id].status = 'انتظار'; });
    broadcastViewers();
  });

  socket.on('kickAll', () => {
    io.emit('kicked');
  });

  // ===== AUDIO =====
  socket.on('playAudio', (data) => {
    if (data?.url) state.audioUrl = data.url;
    if (data?.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', { playing:true, url:state.audioUrl, startedAt:state.audioStartedAt, pausedAt:state.audioPausedAt, volume:state.audioVolume, serverTime:Date.now() });
  });

  socket.on('pauseAudio', () => {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audioState', { playing:false, pausedAt:state.audioPausedAt, volume:state.audioVolume });
  });

  socket.on('restartAudio', (data) => {
    if (data?.url) state.audioUrl = data.url;
    if (data?.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioPausedAt  = 0;
    state.audioStartedAt = Date.now();
    io.emit('audioState', { playing:true, url:state.audioUrl, startedAt:state.audioStartedAt, pausedAt:0, volume:state.audioVolume, serverTime:Date.now() });
  });

  socket.on('stopAudio', () => {
    state.audioPlaying = false; state.audioPausedAt = 0; state.audioStartedAt = null;
    io.emit('audioState', { playing:false, stop:true, volume:state.audioVolume });
  });

  socket.on('setAudioVolume', (data) => {
    if (data?.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  // ===== VIEWER =====
  socket.on('autoJoin', () => {
    viewerCounter++;
    viewers[socket.id] = { id: socket.id, num: viewerCounter, status: 'انتظار' };
    broadcastViewers();
    socket.emit('joinOk');
    socket.emit('state', { ...state, serverTime: Date.now() });
    if (state.audioUrl) {
      socket.emit('audioState', { playing:state.audioPlaying, url:state.audioUrl, startedAt:state.audioStartedAt, pausedAt:state.audioPausedAt, volume:state.audioVolume, serverTime:Date.now() });
    }
  });

  socket.on('statusUpdate', (data) => {
    if (viewers[socket.id]) {
      viewers[socket.id].status = data.status;
      broadcastViewers();
    }
  });

  socket.on('reportDuration', (data) => {
    io.emit('videoDuration', data);
  });

  socket.on('disconnect', () => {
    delete viewers[socket.id];
    broadcastViewers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
