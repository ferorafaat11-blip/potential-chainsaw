const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.use(express.static('public'));

var media = { type:'video', url:'', degree:0, playing:false, startedAt:null, pausedAt:0, volume:1, muted:false };
var audio = { url:'', playing:false, startedAt:null, pausedAt:0, volume:1 };
var viewers = {};
var hosts = {};
var count = 0;
var open = false;

function broadcast() {
  var list = Object.values(viewers);
  io.emit('vlist', list);
  io.emit('vcount', list.length);
}

io.on('connection', function(socket) {

  socket.on('join-host', function() {
    hosts[socket.id] = true;
    delete viewers[socket.id];
    broadcast();
  });

  socket.on('join-viewer', function(data) {
    if (hosts[socket.id]) return;
    if (!viewers[socket.id]) {
      count++;
      viewers[socket.id] = {
        id: socket.id,
        num: count,
        name: (data && data.name) ? data.name : 'جهاز ' + count,
        status: 'انتظار'
      };
      broadcast();
    }
    socket.emit('welcome', { open: open, media: media, audio: audio, serverTime: Date.now() });
  });

  socket.on('set-open', function(data) {
    hosts[socket.id] = true;
    delete viewers[socket.id];
    open = data.open;
    var ids = Object.keys(viewers);
    for (var i = 0; i < ids.length; i++) {
      var s = io.sockets.sockets.get(ids[i]);
      if (open) {
        if (s) s.emit('room-open');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'اختيار وضع';
      } else {
        if (s) s.emit('room-closed');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'انتظار';
      }
    }
    broadcast();
    socket.emit('open-ok', { open: open });
  });

  socket.on('cmd-play', function(data) {
    media.url     = data.url     || media.url;
    media.type    = data.type    || media.type;
    media.degree  = data.degree  !== undefined ? data.degree  : media.degree;
    media.volume  = data.volume  !== undefined ? data.volume  : media.volume;
    media.muted   = data.muted   !== undefined ? data.muted   : media.muted;
    media.playing   = true;
    media.pausedAt  = 0;
    media.startedAt = Date.now();
    io.emit('media', Object.assign({}, media, { serverTime: Date.now() }));
  });

  socket.on('cmd-pause', function() {
    if (media.startedAt) media.pausedAt = (Date.now() - media.startedAt) / 1000;
    media.playing = false;
    io.emit('media', Object.assign({}, media, { serverTime: Date.now() }));
  });

  socket.on('cmd-seek', function(data) {
    media.pausedAt  = data.t;
    media.startedAt = Date.now() - (data.t * 1000);
    io.emit('media', Object.assign({}, media, { serverTime: Date.now() }));
  });

  socket.on('cmd-vol', function(data) {
    media.volume = data.v !== undefined ? data.v : media.volume;
    media.muted  = data.m !== undefined ? data.m : media.muted;
    io.emit('vol', { v: media.volume, m: media.muted });
  });

  socket.on('cmd-sync', function() {
    io.emit('media', Object.assign({}, media, { serverTime: Date.now() }));
  });

  socket.on('cmd-dur', function(d) {
    io.emit('dur', d);
  });

  socket.on('audio-play', function(data) {
    audio.url       = data.url   || audio.url;
    audio.volume    = data.v     !== undefined ? data.v : audio.volume;
    audio.playing   = true;
    audio.pausedAt  = 0;
    audio.startedAt = Date.now();
    io.emit('audio', Object.assign({}, audio, { serverTime: Date.now() }));
  });

  socket.on('audio-pause', function() {
    if (audio.startedAt) audio.pausedAt = (Date.now() - audio.startedAt) / 1000;
    audio.playing = false;
    io.emit('audio', Object.assign({}, audio, { serverTime: Date.now() }));
  });

  socket.on('audio-restart', function(data) {
    audio.url       = data.url || audio.url;
    audio.volume    = data.v   !== undefined ? data.v : audio.volume;
    audio.playing   = true;
    audio.pausedAt  = 0;
    audio.startedAt = Date.now();
    io.emit('audio', Object.assign({}, audio, { serverTime: Date.now() }));
  });

  socket.on('audio-stop', function() {
    audio.playing   = false;
    audio.pausedAt  = 0;
    audio.startedAt = null;
    io.emit('audio', { playing: false, stop: true });
  });

  socket.on('audio-seek', function(data) {
    audio.pausedAt  = data.t;
    audio.startedAt = Date.now() - (data.t * 1000);
    io.emit('audio', Object.assign({}, audio, { serverTime: Date.now() }));
  });

  socket.on('audio-vol', function(data) {
    audio.volume = data.v !== undefined ? data.v : audio.volume;
    io.emit('avol', { v: audio.volume });
  });

  socket.on('audio-dur', function(d) {
    io.emit('adur', d);
  });

  socket.on('restart-session', function() {
    // ابعت الأجهزة لشاشة الاختيار من غير ما تمسح حاجة
    var ids = Object.keys(viewers);
    for (var i = 0; i < ids.length; i++) {
      var s = io.sockets.sockets.get(ids[i]);
      if (s) s.emit('room-open');
      if (viewers[ids[i]]) viewers[ids[i]].status = 'اختيار وضع';
    }
    bcast();
  });

  socket.on('countdown', function(data) {
    io.emit('countdown', { secs: data.secs });
  });

  socket.on('kick-one', function(data) {
    var t = io.sockets.sockets.get(data.id);
    if (t) { t.emit('kicked'); delete viewers[data.id]; broadcast(); }
  });

  socket.on('kick-all', function() {
    io.emit('kicked');
  });

  socket.on('viewer-status', function(data) {
    if (viewers[socket.id]) { viewers[socket.id].status = data.s; broadcast(); }
  });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    delete hosts[socket.id];
    broadcast();
  });

});

var PORT = process.env.PORT || 3000;
httpServer.listen(PORT, function() { console.log('listening on ' + PORT); });
