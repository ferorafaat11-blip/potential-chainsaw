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
  audioUrl: '', audioPlaying: false, audioStartedAt: null, audioPausedAt: 0, audioVolume: 1
};

var viewers = {};
var hostSockets = {};
var viewerCounter = 0;
var allowJoin = false;

function broadcastViewers() {
  var list = Object.values(viewers);
  io.emit('viewers', list.length);
  io.emit('viewerList', list);
}

function getState() {
  return {
    type: state.type, url: state.url, degree: state.degree,
    playing: state.playing, startedAt: state.startedAt, pausedAt: state.pausedAt,
    volume: state.volume, muted: state.muted,
    audioUrl: state.audioUrl, audioPlaying: state.audioPlaying,
    audioStartedAt: state.audioStartedAt, audioPausedAt: state.audioPausedAt,
    audioVolume: state.audioVolume, serverTime: Date.now()
  };
}

io.on('connection', function(socket) {

  socket.on('registerHost', function() {
    hostSockets[socket.id] = true;
    if (viewers[socket.id]) { delete viewers[socket.id]; broadcastViewers(); }
  });

  socket.on('play', function(data) {
    if (data && data.url !== undefined) state.url = data.url;
    if (data && data.type !== undefined) state.type = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted !== undefined) state.muted = data.muted;
    state.playing = true;
    state.startedAt = Date.now() - (state.pausedAt * 1000);
    io.emit('state', getState());
  });

  socket.on('pause', function() {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', getState());
  });

  socket.on('restart', function(data) {
    if (data && data.url !== undefined) state.url = data.url;
    if (data && data.type !== undefined) state.type = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted !== undefined) state.muted = data.muted;
    state.playing = true; state.pausedAt = 0; state.startedAt = Date.now();
    io.emit('state', getState());
  });

  socket.on('show', function(data) {
    if (data && data.url !== undefined) state.url = data.url;
    if (data && data.type !== undefined) state.type = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted !== undefined) state.muted = data.muted;
    state.playing = true; state.startedAt = Date.now(); state.pausedAt = 0;
    io.emit('state', getState());
  });

  socket.on('seek', function(data) {
    state.pausedAt = data.seconds;
    state.startedAt = Date.now() - (data.seconds * 1000);
    io.emit('state', getState());
  });

  socket.on('setVolume', function(data) {
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted !== undefined) state.muted = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  socket.on('syncAll', function() { io.emit('sync', getState()); });

  socket.on('kickAll', function() { io.emit('kicked'); });

  socket.on('kickOne', function(data) {
    var target = io.sockets.sockets.get(data.id);
    if (target) { target.emit('kicked'); delete viewers[data.id]; broadcastViewers(); }
  });

  socket.on('playAudio', function(data) {
    if (data && data.url !== undefined) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', { playing: true, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
  });

  socket.on('pauseAudio', function() {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audioState', { playing: false, pausedAt: state.audioPausedAt, volume: state.audioVolume });
  });

  socket.on('restartAudio', function(data) {
    if (data && data.url !== undefined) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying = true; state.audioPausedAt = 0; state.audioStartedAt = Date.now();
    io.emit('audioState', { playing: true, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: 0, volume: state.audioVolume, serverTime: Date.now() });
  });

  socket.on('stopAudio', function() {
    state.audioPlaying = false; state.audioPausedAt = 0; state.audioStartedAt = null;
    io.emit('audioState', { playing: false, stop: true, volume: state.audioVolume });
  });

  socket.on('seekAudio', function(data) {
    state.audioPausedAt = data.seconds;
    state.audioStartedAt = Date.now() - (data.seconds * 1000);
    io.emit('audioState', { playing: state.audioPlaying, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
  });

  socket.on('setAudioVolume', function(data) {
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  socket.on('setAllowJoin', function(data) {
    allowJoin = data.allow;
    var ids = Object.keys(viewers);
    for (var i = 0; i < ids.length; i++) {
      var s = io.sockets.sockets.get(ids[i]);
      if (allowJoin) {
        if (s) s.emit('sessionStart');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'اختيار وضع';
      } else {
        if (s) s.emit('sessionStop');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'انتظار';
      }
    }
    broadcastViewers();
    socket.emit('joinToggleOk', { allow: allowJoin });
  });

  socket.on('autoJoin', function(data) {
    if (hostSockets[socket.id]) return;
    if (!viewers[socket.id]) {
      viewerCounter++;
      var name = (data && data.name) ? data.name : ('جهاز ' + viewerCounter);
      viewers[socket.id] = { id: socket.id, num: viewerCounter, name: name, status: 'انتظار' };
      broadcastViewers();
    }
    socket.emit('joinOk', { allow: allowJoin });
    socket.emit('state', getState());
    if (state.audioUrl) {
      socket.emit('audioState', { playing: state.audioPlaying, url: state.audioUrl, startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt, volume: state.audioVolume, serverTime: Date.now() });
    }
  });

  socket.on('statusUpdate', function(data) {
    if (viewers[socket.id]) { viewers[socket.id].status = data.status; broadcastViewers(); }
  });

  socket.on('reportDuration', function(data) { io.emit('videoDuration', data); });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    delete hostSockets[socket.id];
    broadcastViewers();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() { console.log('Server on port ' + PORT); });
olume !== undefined) state.volume = data.volume;
    if (data && data.muted !== undefined) state.muted = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  socket.on('syncAll', function() {
    io.emit('sync', getState());
  });

  socket.on('kickAll', function() {
    io.emit('kicked');
  });

  socket.on('kickOne', function(data) {
    var target = io.sockets.sockets.get(data.id);
    if (target) {
      target.emit('kicked');
      delete viewers[data.id];
      broadcastViewers();
    }
  });

  socket.on('playAudio', function(data) {
    if (data && data.url !== undefined) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', {
      playing: true,
      url: state.audioUrl,
      startedAt: state.audioStartedAt,
      pausedAt: state.audioPausedAt,
      volume: state.audioVolume,
      serverTime: Date.now()
    });
  });

  socket.on('pauseAudio', function() {
    if (state.audioStartedAt) {
      state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    }
    state.audioPlaying = false;
    io.emit('audioState', {
      playing: false,
      pausedAt: state.audioPausedAt,
      volume: state.audioVolume
    });
  });

  socket.on('restartAudio', function(data) {
    if (data && data.url !== undefined) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying = true;
    state.audioPausedAt = 0;
    state.audioStartedAt = Date.now();
    io.emit('audioState', {
      playing: true,
      url: state.audioUrl,
      startedAt: state.audioStartedAt,
      pausedAt: 0,
      volume: state.audioVolume,
      serverTime: Date.now()
    });
  });

  socket.on('stopAudio', function() {
    state.audioPlaying = false;
    state.audioPausedAt = 0;
    state.audioStartedAt = null;
    io.emit('audioState', {
      playing: false,
      stop: true,
      volume: state.audioVolume
    });
  });

  socket.on('seekAudio', function(data) {
    state.audioPausedAt = data.seconds;
    state.audioStartedAt = Date.now() - (data.seconds * 1000);
    io.emit('audioState', {
      playing: state.audioPlaying,
      url: state.audioUrl,
      startedAt: state.audioStartedAt,
      pausedAt: state.audioPausedAt,
      volume: state.audioVolume,
      serverTime: Date.now()
    });
  });

  socket.on('setAudioVolume', function(data) {
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  socket.on('setAllowJoin', function(data) {
    allowJoin = data.allow;
    var ids = Object.keys(viewers);
    var i;
    if (allowJoin) {
      for (i = 0; i < ids.length; i++) {
        var s1 = io.sockets.sockets.get(ids[i]);
        if (s1) s1.emit('sessionStart');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'اختيار وضع';
      }
    } else {
      for (i = 0; i < ids.length; i++) {
        var s2 = io.sockets.sockets.get(ids[i]);
        if (s2) s2.emit('sessionStop');
        if (viewers[ids[i]]) viewers[ids[i]].status = 'انتظار';
      }
    }
    broadcastViewers();
    socket.emit('joinToggleOk', { allow: allowJoin });
  });

  socket.on('autoJoin', function(data) {
    if (hostSockets[socket.id]) return;
    if (!viewers[socket.id]) {
      viewerCounter++;
      var name = (data && data.name) ? data.name : ('جهاز ' + viewerCounter);
      viewers[socket.id] = {
        id: socket.id,
        num: viewerCounter,
        name: name,
        status: 'انتظار'
      };
      broadcastViewers();
    }
    socket.emit('joinOk', { allow: allowJoin });
    socket.emit('state', getState());
    if (state.audioUrl) {
      socket.emit('audioState', {
        playing: state.audioPlaying,
        url: state.audioUrl,
        startedAt: state.audioStartedAt,
        pausedAt: state.audioPausedAt,
        volume: state.audioVolume,
        serverTime: Date.now()
      });
    }
  });

  socket.on('statusUpdate', function(data) {
    if (viewers[socket.id]) {
      viewers[socket.id].status = data.status;
      broadcastViewers();
    }
  });

  socket.on('reportDuration', function(data) {
    io.emit('videoDuration', data);
  });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    delete hostSockets[socket.id];
    broadcastViewers();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server on port ' + PORT);
});
    }
  });

  socket.on('play', function(data) {
    if (data && data.url)    state.url    = data.url;
    if (data && data.type)   state.type   = data.type;
    if (data && data.degree  !== undefined) state.degree  = data.degree;
    if (data && data.volume  !== undefined) state.volume  = data.volume;
    if (data && data.muted   !== undefined) state.muted   = data.muted;
    state.playing   = true;
    state.startedAt = Date.now() - (state.pausedAt * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('pause', function() {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('restart', function(data) {
    if (data && data.url)   state.url   = data.url;
    if (data && data.type)  state.type  = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.pausedAt  = 0;
    state.startedAt = Date.now();
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('show', function(data) {
    state.url  = data.url;
    state.type = data.type;
    if (data.degree !== undefined) state.degree = data.degree;
    if (data.volume !== undefined) state.volume = data.volume;
    if (data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.startedAt = Date.now();
    state.pausedAt  = 0;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('seek', function(data) {
    state.pausedAt  = data.seconds;
    state.startedAt = Date.now() - (data.seconds * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('setVolume', function(data) {
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  socket.on('syncAll', function() {
    io.emit('sync', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('kickAll', function() {
    io.emit('kicked');
  });

  socket.on('playAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('pauseAudio', function() {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audioState', { playing: false, pausedAt: state.audioPausedAt, volume: state.audioVolume });
  });

  socket.on('restartAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioPausedAt  = 0;
    state.audioStartedAt = Date.now();
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: 0,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('stopAudio', function() {
    state.audioPlaying = false;
    state.audioPausedAt = 0;
    state.audioStartedAt = null;
    io.emit('audioState', { playing: false, stop: true, volume: state.audioVolume });
  });

  socket.on('seekAudio', function(data) {
    state.audioPausedAt  = data.seconds;
    state.audioStartedAt = Date.now() - (data.seconds * 1000);
    io.emit('audioState', {
      playing: state.audioPlaying, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('setAudioVolume', function(data) {
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  socket.on('setAllowJoin', function(data) {
    allowJoin = data.allow;
    var viewerIds = Object.keys(viewers);
    if (allowJoin) {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStart');
        if (viewers[id]) viewers[id].status = 'اختيار وضع';
      });
    } else {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStop');
        if (viewers[id]) viewers[id].status = 'انتظار';
      });
    }
    broadcastViewers();
    socket.emit('joinToggleOk', { allow: allowJoin });
  });

  socket.on('autoJoin', function(data) {
    // تجاهل لو هوست
    if (hostSockets[socket.id]) return;
    // لو الجهاز بعت autoJoin قبل كده متزودش counter
    if (!viewers[socket.id]) {
      viewerCounter++;
      var name = (data && data.name) ? data.name : ('جهاز ' + viewerCounter);
      viewers[socket.id] = { id: socket.id, num: viewerCounter, name: name, status: 'انتظار' };
      broadcastViewers();
    }
    socket.emit('joinOk', { allow: allowJoin });
    socket.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
    if (state.audioUrl) {
      socket.emit('audioState', {
        playing: state.audioPlaying, url: state.audioUrl,
        startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
        volume: state.audioVolume, serverTime: Date.now()
      });
    }
  });

  socket.on('kickOne', function(data) {
    var target = io.sockets.sockets.get(data.id);
    if (target) {
      target.emit('kicked');
      delete viewers[data.id];
      broadcastViewers();
    }
  });

  socket.on('statusUpdate', function(data) {
    if (viewers[socket.id]) {
      viewers[socket.id].status = data.status;
      broadcastViewers();
    }
  });

  socket.on('reportDuration', function(data) {
    io.emit('videoDuration', data);
  });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    delete hostSockets[socket.id];
    broadcastViewers();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server on port ' + PORT);
});
    state.startedAt = Date.now() - (state.pausedAt * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('pause', function() {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('restart', function(data) {
    if (data && data.url)   state.url   = data.url;
    if (data && data.type)  state.type  = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.pausedAt  = 0;
    state.startedAt = Date.now();
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('show', function(data) {
    state.url  = data.url;
    state.type = data.type;
    if (data.degree !== undefined) state.degree = data.degree;
    if (data.volume !== undefined) state.volume = data.volume;
    if (data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.startedAt = Date.now();
    state.pausedAt  = 0;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('seek', function(data) {
    state.pausedAt  = data.seconds;
    state.startedAt = Date.now() - (data.seconds * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('setVolume', function(data) {
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  socket.on('syncAll', function() {
    io.emit('sync', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('kickAll', function() {
    io.emit('kicked');
  });

  socket.on('playAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('pauseAudio', function() {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audioState', { playing: false, pausedAt: state.audioPausedAt, volume: state.audioVolume });
  });

  socket.on('restartAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioPausedAt  = 0;
    state.audioStartedAt = Date.now();
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: 0,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('stopAudio', function() {
    state.audioPlaying = false;
    state.audioPausedAt = 0;
    state.audioStartedAt = null;
    io.emit('audioState', { playing: false, stop: true, volume: state.audioVolume });
  });

  socket.on('seekAudio', function(data) {
    state.audioPausedAt  = data.seconds;
    state.audioStartedAt = Date.now() - (data.seconds * 1000);
    io.emit('audioState', {
      playing: state.audioPlaying, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('setAudioVolume', function(data) {
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  socket.on('setAllowJoin', function(data) {
    allowJoin = data.allow;
    var viewerIds = Object.keys(viewers);
    if (allowJoin) {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStart');
        if (viewers[id]) viewers[id].status = 'اختيار وضع';
      });
    } else {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStop');
        if (viewers[id]) viewers[id].status = 'انتظار';
      });
    }
    broadcastViewers();
    socket.emit('joinToggleOk', { allow: allowJoin });
  });

  socket.on('autoJoin', function(data) {
    // لو الجهاز بعت autoJoin قبل كده متزودش counter
    if (!viewers[socket.id]) {
      viewerCounter++;
      var name = (data && data.name) ? data.name : ('جهاز ' + viewerCounter);
      viewers[socket.id] = { id: socket.id, num: viewerCounter, name: name, status: 'انتظار' };
      broadcastViewers();
    }
    socket.emit('joinOk', { allow: allowJoin });
    socket.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
    if (state.audioUrl) {
      socket.emit('audioState', {
        playing: state.audioPlaying, url: state.audioUrl,
        startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
        volume: state.audioVolume, serverTime: Date.now()
      });
    }
  });

  socket.on('kickOne', function(data) {
    var target = io.sockets.sockets.get(data.id);
    if (target) {
      target.emit('kicked');
      delete viewers[data.id];
      broadcastViewers();
    }
  });

  socket.on('statusUpdate', function(data) {
    if (viewers[socket.id]) {
      viewers[socket.id].status = data.status;
      broadcastViewers();
    }
  });

  socket.on('reportDuration', function(data) {
    io.emit('videoDuration', data);
  });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    broadcastViewers();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server on port ' + PORT);
});
    state.startedAt = Date.now() - (state.pausedAt * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('pause', function() {
    if (state.startedAt) state.pausedAt = (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('restart', function(data) {
    if (data && data.url)   state.url   = data.url;
    if (data && data.type)  state.type  = data.type;
    if (data && data.degree !== undefined) state.degree = data.degree;
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.pausedAt  = 0;
    state.startedAt = Date.now();
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('show', function(data) {
    state.url  = data.url;
    state.type = data.type;
    if (data.degree !== undefined) state.degree = data.degree;
    if (data.volume !== undefined) state.volume = data.volume;
    if (data.muted  !== undefined) state.muted  = data.muted;
    state.playing   = true;
    state.startedAt = Date.now();
    state.pausedAt  = 0;
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('seek', function(data) {
    state.pausedAt  = data.seconds;
    state.startedAt = Date.now() - (data.seconds * 1000);
    io.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('setVolume', function(data) {
    if (data && data.volume !== undefined) state.volume = data.volume;
    if (data && data.muted  !== undefined) state.muted  = data.muted;
    io.emit('setVolume', { volume: state.volume, muted: state.muted });
  });

  socket.on('syncAll', function() {
    io.emit('sync', Object.assign({}, state, { serverTime: Date.now() }));
  });

  socket.on('kickAll', function() {
    io.emit('kicked');
  });

  socket.on('playAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioStartedAt = Date.now() - (state.audioPausedAt * 1000);
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('pauseAudio', function() {
    if (state.audioStartedAt) state.audioPausedAt = (Date.now() - state.audioStartedAt) / 1000;
    state.audioPlaying = false;
    io.emit('audioState', { playing: false, pausedAt: state.audioPausedAt, volume: state.audioVolume });
  });

  socket.on('restartAudio', function(data) {
    if (data && data.url) state.audioUrl = data.url;
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    state.audioPlaying   = true;
    state.audioPausedAt  = 0;
    state.audioStartedAt = Date.now();
    io.emit('audioState', {
      playing: true, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: 0,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('stopAudio', function() {
    state.audioPlaying = false;
    state.audioPausedAt = 0;
    state.audioStartedAt = null;
    io.emit('audioState', { playing: false, stop: true, volume: state.audioVolume });
  });

  socket.on('seekAudio', function(data) {
    state.audioPausedAt  = data.seconds;
    state.audioStartedAt = Date.now() - (data.seconds * 1000);
    io.emit('audioState', {
      playing: state.audioPlaying, url: state.audioUrl,
      startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
      volume: state.audioVolume, serverTime: Date.now()
    });
  });

  socket.on('setAudioVolume', function(data) {
    if (data && data.volume !== undefined) state.audioVolume = data.volume;
    io.emit('audioVolume', { volume: state.audioVolume });
  });

  socket.on('setAllowJoin', function(data) {
    allowJoin = data.allow;
    var viewerIds = Object.keys(viewers);
    if (allowJoin) {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStart');
        if (viewers[id]) viewers[id].status = 'اختيار وضع';
      });
    } else {
      viewerIds.forEach(function(id) {
        var s = io.sockets.sockets.get(id);
        if (s) s.emit('sessionStop');
        if (viewers[id]) viewers[id].status = 'انتظار';
      });
    }
    broadcastViewers();
    socket.emit('joinToggleOk', { allow: allowJoin });
  });

  socket.on('autoJoin', function(data) {
    viewerCounter++;
    var name = (data && data.name) ? data.name : ('جهاز ' + viewerCounter);
    viewers[socket.id] = { id: socket.id, num: viewerCounter, name: name, status: 'انتظار' };
    broadcastViewers();
    socket.emit('joinOk', { allow: allowJoin });
    socket.emit('state', Object.assign({}, state, { serverTime: Date.now() }));
    if (state.audioUrl) {
      socket.emit('audioState', {
        playing: state.audioPlaying, url: state.audioUrl,
        startedAt: state.audioStartedAt, pausedAt: state.audioPausedAt,
        volume: state.audioVolume, serverTime: Date.now()
      });
    }
  });

  socket.on('kickOne', function(data) {
    var target = io.sockets.sockets.get(data.id);
    if (target) {
      target.emit('kicked');
      delete viewers[data.id];
      broadcastViewers();
    }
  });

  socket.on('statusUpdate', function(data) {
    if (viewers[socket.id]) {
      viewers[socket.id].status = data.status;
      broadcastViewers();
    }
  });

  socket.on('reportDuration', function(data) {
    io.emit('videoDuration', data);
  });

  socket.on('disconnect', function() {
    delete viewers[socket.id];
    broadcastViewers();
  });

});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server on port ' + PORT);
});
