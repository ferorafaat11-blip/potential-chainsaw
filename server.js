const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.use(express.static('public'));

// ─── ROOMS ───
// rooms[roomId] = { id, name, host:socketId, media, audio, viewers, open, mediaList, audioList }
var rooms = {};
var socketRoom = {}; // socketId -> roomId

function makeId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getRoom(socketId) {
  return rooms[socketRoom[socketId]];
}

function bcastRoom(roomId) {
  var room = rooms[roomId];
  if (!room) return;
  var list = Object.values(room.viewers);
  io.to(roomId).emit('vlist', list);
  io.to(roomId).emit('vcount', list.length);
}

function defMedia() {
  return { type:'video', url:'', degree:0, playing:false, startedAt:null, pausedAt:0, volume:1, muted:false };
}
function defAudio() {
  return { url:'', playing:false, startedAt:null, pausedAt:0, volume:1 };
}

// ─── SOCKET ───
io.on('connection', function(socket) {

  // ── HOST: إنشاء روم ──
  socket.on('create-room', function(data) {
    var id = makeId();
    rooms[id] = {
      id: id,
      name: data.name || 'الروم',
      host: socket.id,
      media: defMedia(),
      audio: defAudio(),
      viewers: {},
      vcount: 0,
      open: false,
      mediaList: data.mediaList || [],
      audioList: data.audioList || []
    };
    socketRoom[socket.id] = id;
    socket.join(id);
    socket.emit('room-created', { id: id, name: rooms[id].name });
  });

  // ── HOST: استرجاع روم موجود بعد refresh ──
  socket.on('rejoin-host', function(data) {
    var room = rooms[data.roomId];
    if (!room) { socket.emit('room-not-found'); return; }
    room.host = socket.id;
    socketRoom[socket.id] = data.roomId;
    socket.join(data.roomId);
    socket.emit('room-rejoined', {
      id: room.id, name: room.name,
      media: room.media, audio: room.audio,
      open: room.open,
      mediaList: room.mediaList,
      audioList: room.audioList
    });
    bcastRoom(data.roomId);
  });

  // ── HOST: حذف روم ──
  socket.on('delete-room', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    var rid = room.id;
    io.to(rid).emit('room-deleted');
    io.socketsLeave(rid);
    // امسح كل الـ viewers من socketRoom
    Object.keys(room.viewers).forEach(function(vid) { delete socketRoom[vid]; });
    delete socketRoom[socket.id];
    delete rooms[rid];
  });

  // ── HOST: حفظ القوائم ──
  socket.on('save-lists', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    if (data.mediaList) room.mediaList = data.mediaList;
    if (data.audioList) room.audioList = data.audioList;
  });

  // ── VIEWER: دخول روم ──
  socket.on('join-viewer', function(data) {
    // لو مفيش roomId — اتصل بأول روم موجود
    var rid = data.roomId;
    if (!rid) {
      var keys = Object.keys(rooms);
      if (keys.length > 0) rid = keys[0];
    }
    var room = rooms[rid];
    if (!room) { socket.emit('room-not-found'); return; }
    socketRoom[socket.id] = rid;
    socket.join(rid);
    if (!room.viewers[socket.id]) {
      room.vcount++;
      room.viewers[socket.id] = {
        id: socket.id,
        num: room.vcount,
        name: data.name || ('جهاز ' + room.vcount),
        status: 'انتظار'
      };
      bcastRoom(rid);
    }
    socket.emit('welcome', {
      open: room.open,
      media: room.media,
      audio: room.audio,
      serverTime: Date.now()
    });
  });

  // ── SET OPEN ──
  socket.on('set-open', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    room.open = data.open;
    var ids = Object.keys(room.viewers);
    ids.forEach(function(vid) {
      var s = io.sockets.sockets.get(vid);
      if (room.open) {
        if (s) s.emit('room-open');
        if (room.viewers[vid]) room.viewers[vid].status = 'اختيار وضع';
      } else {
        if (s) s.emit('room-closed');
        if (room.viewers[vid]) room.viewers[vid].status = 'انتظار';
      }
    });
    bcastRoom(room.id);
    socket.emit('open-ok', { open: room.open });
  });

  // ── RESTART SESSION ──
  socket.on('restart-session', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    Object.keys(room.viewers).forEach(function(vid) {
      var s = io.sockets.sockets.get(vid);
      if (s) s.emit('room-open');
      if (room.viewers[vid]) room.viewers[vid].status = 'اختيار وضع';
    });
    bcastRoom(room.id);
  });

  // ── MEDIA COMMANDS ──
  socket.on('cmd-play', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var m = room.media;
    if (data.url)    m.url    = data.url;
    if (data.type)   m.type   = data.type;
    if (data.degree  !== undefined) m.degree  = data.degree;
    if (data.volume  !== undefined) m.volume  = data.volume;
    if (data.muted   !== undefined) m.muted   = data.muted;
    m.playing = true; m.pausedAt = 0; m.startedAt = Date.now();
    io.to(room.id).emit('media', Object.assign({}, m, { serverTime: Date.now() }));
  });

  socket.on('cmd-pause', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    var m = room.media;
    if (m.startedAt) m.pausedAt = (Date.now() - m.startedAt) / 1000;
    m.playing = false;
    io.to(room.id).emit('media', Object.assign({}, m, { serverTime: Date.now() }));
  });

  socket.on('cmd-seek', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var m = room.media;
    m.pausedAt = data.t;
    m.startedAt = Date.now() - (data.t * 1000);
    io.to(room.id).emit('media', Object.assign({}, m, { serverTime: Date.now() }));
  });

  socket.on('cmd-vol', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var m = room.media;
    if (data.v !== undefined) m.volume = data.v;
    if (data.m !== undefined) m.muted  = data.m;
    io.to(room.id).emit('vol', { v: m.volume, m: m.muted });
  });

  socket.on('cmd-sync', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    io.to(room.id).emit('media', Object.assign({}, room.media, { serverTime: Date.now() }));
  });

  socket.on('cmd-dur', function(d) {
    var room = getRoom(socket.id);
    if (!room) return;
    io.to(room.id).emit('dur', d);
  });

  // ── AUDIO COMMANDS ──
  socket.on('audio-play', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var a = room.audio;
    if (data.url) a.url = data.url;
    if (data.v !== undefined) a.volume = data.v;
    a.playing = true; a.pausedAt = 0; a.startedAt = Date.now();
    io.to(room.id).emit('audio', Object.assign({}, a, { serverTime: Date.now() }));
  });

  socket.on('audio-pause', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    var a = room.audio;
    if (a.startedAt) a.pausedAt = (Date.now() - a.startedAt) / 1000;
    a.playing = false;
    io.to(room.id).emit('audio', Object.assign({}, a, { serverTime: Date.now() }));
  });

  socket.on('audio-restart', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var a = room.audio;
    if (data && data.url) a.url = data.url;
    if (data && data.v !== undefined) a.volume = data.v;
    a.playing = true; a.pausedAt = 0; a.startedAt = Date.now();
    io.to(room.id).emit('audio', Object.assign({}, a, { serverTime: Date.now() }));
  });

  socket.on('audio-stop', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    var a = room.audio;
    a.playing = false; a.pausedAt = 0; a.startedAt = null;
    io.to(room.id).emit('audio', { playing: false, stop: true });
  });

  socket.on('audio-seek', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var a = room.audio;
    a.pausedAt = data.t; a.startedAt = Date.now() - (data.t * 1000);
    io.to(room.id).emit('audio', Object.assign({}, a, { serverTime: Date.now() }));
  });

  socket.on('audio-vol', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    if (data.v !== undefined) room.audio.volume = data.v;
    io.to(room.id).emit('avol', { v: room.audio.volume });
  });

  socket.on('audio-dur', function(d) {
    var room = getRoom(socket.id);
    if (!room) return;
    io.to(room.id).emit('adur', d);
  });

  // ── KICK ──
  socket.on('kick-one', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    var t = io.sockets.sockets.get(data.id);
    if (t) { t.emit('kicked'); delete room.viewers[data.id]; delete socketRoom[data.id]; bcastRoom(room.id); }
  });

  socket.on('kick-all', function() {
    var room = getRoom(socket.id);
    if (!room) return;
    io.to(room.id).emit('kicked');
    Object.keys(room.viewers).forEach(function(vid) { delete socketRoom[vid]; });
    room.viewers = {};
    bcastRoom(room.id);
  });

  socket.on('countdown', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    io.to(room.id).emit('countdown', { secs: data.secs });
  });

  socket.on('viewer-status', function(data) {
    var room = getRoom(socket.id);
    if (!room) return;
    if (room.viewers[socket.id]) { room.viewers[socket.id].status = data.s; bcastRoom(room.id); }
  });

  socket.on('disconnect', function() {
    var rid = socketRoom[socket.id];
    if (!rid || !rooms[rid]) { delete socketRoom[socket.id]; return; }
    var room = rooms[rid];
    if (room.host === socket.id) {
      // الهوست اتقطع — الروم لسه موجود لحد ما يرجع
    } else {
      delete room.viewers[socket.id];
      bcastRoom(rid);
    }
    delete socketRoom[socket.id];
  });

});

var PORT = process.env.PORT || 3000;
httpServer.listen(PORT, function() { console.log('listening on ' + PORT); });
