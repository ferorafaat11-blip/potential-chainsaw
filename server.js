const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

var state = {
  type: 'video', url: '', degree: 0,
  playing: false, startedAt: null, pausedAt: 0,
  volume: 1, muted: false,
  audioUrl: '', audioPlaying: false,
  audioStartedAt: null, audioPausedAt: 0, audioVolume: 1
};

var viewers = {};
var counter = 0;
var hosts = {};
var allowJoin = false;

function bcast() {
  var list = Object.values(viewers);
  io.emit('viewers', list.length);
  io.emit('viewerList', list);
}

function gs() {
  return {
    type: state.type, url: state.url, degree: state.degree,
    playing: state.playing, startedAt: state.startedAt, pausedAt: state.pausedAt,
    volume: state.volume, muted: state.muted, serverTime: Date.now()
  };
}

io.on('connection', function(s) {

  s.on('host', function() {
    hosts[s.id] = true;
    if (viewers[s.id]) { delete viewers[s.id]; bcast(); }
  });

  s.on('viewer', function(data) {
    if (hosts[s.id]) return;
    if (!viewers[s.id]) {
      counter++;
      viewers[s.id] = { id: s.id, num: counter, name: (data && data.name) || ('جهاز ' + counter), status: 'انتظار' };
      bcast();
    }
    s.emit('joinOk', { allow: allowJoin });
    s.emit('state', gs());
    if (state.audioUrl) {
      s.emit('audio', { playing: state.audioPlaying, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
    }
  });

  s.on('open', function(data) {
    hosts[s.id] = true;
    if (viewers[s.id]) { delete viewers[s.id]; bcast(); }
    allowJoin = data.allow;
    var ids = Object.keys(viewers);
    for (var i = 0; i < ids.length; i++) {
      var c = io.sockets.sockets.get(ids[i]);
      if (allowJoin) {
        if (c) c.emit('go');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'اختيار وضع';
      } else {
        if (c) c.emit('stop');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'انتظار';
      }
    }
    bcast();
    s.emit('openOk', { allow: allowJoin });
  });

  s.on('play', function(data) {
    if (data.url) state.url = data.url;
    if (data.type) state.type = data.type;
    if (data.degree !== undefined) state.degree = data.degree;
    if (data.volume !== undefined) state.volume = data.volume;
    if (data.muted !== undefined) state.muted = data.muted;
    state.playing = true;
    // forceRestart: ابدأ من الصفر دايماً
    if (data.forceRestart) {
      state.pausedAt = 0;
      state.startedAt = Date.now();
    } else {
      state.startedAt = Date.now() - (state.pausedAt * 1000);
    }
    io.emit('state', gs());
  });

  s.on('pause', function() {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', gs());
  });

  s.on('seek', function(data) {
    state.pausedAt = data.t;
    state.startedAt = Date.now() - (data.t * 1000);
    io.emit('state', gs());
  });

  s.on('vol', function(data) {
    if (data.v !== undefined) state.volume = data.v;
    if (data.m !== undefined) state.muted = data.m;
    io.emit('vol', { v: state.volume, m: state.muted });
  });

  s.on('sync', function() { io.emit('state', gs()); });

  s.on('dur', function(data) { io.emit('dur', data); });

  s.on('adur', function(data) { io.emit('adur', data); });

  s.on('aplay', function(data) {
    if (data.url) state.audioUrl = data.url;
    if (data.v !== undefined) state.audioVolume = data.v;
    state.audioPlaying = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audio', { playing: true, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
  });

  s.on('apause', function() {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audio', { playing: false, pausedAt: state.audioPausedAt, volume: state.audioVolume });
  });

  s.on('arestart', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.v !== undefined) state.audioVolume = data.v;
    state.audioPlaying = true; state.audioPausedAt = 0;
    state.audioStartedAt = Date.now();
    io.emit('audio', { playing: true, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: 0, volume: state.audioVolume, serverTime: Date.now() });
  });

  s.on('astop', function() {
    state.audioPlaying = false; state.audioPausedAt = 0; state.audioStartedAt = null;
    io.emit('audio', { playing: false, stop: true });
  });

  s.on('aseek', function(data) {
    state.audioPausedAt = data.t;
    state.audioStartedAt = Date.now() - (data.t * 1000);
    io.emit('audio', { playing: state.audioPlaying, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
  });

  s.on('avol', function(data) {
    if (data.v !== undefined) state.audioVolume = data.v;
    io.emit('avol', { v: state.audioVolume });
  });

  s.on('kick', function(data) {
    var t = io.sockets.sockets.get(data.id);
    if (t) { t.emit('kicked'); delete viewers[data.id]; bcast(); }
  });

  s.on('kickall', function() { io.emit('kicked'); });

  s.on('status', function(data) {
    if (viewers[s.id]) { viewers[s.id].status = data.s; bcast(); }
  });

  s.on('disconnect', function() {
    delete viewers[s.id]; delete hosts[s.id]; bcast();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() { console.log('port ' + PORT); });
