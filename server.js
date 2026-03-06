const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let state = {
  videoId: null,
  playing: false,
  startTime: 0
};

io.on('connection', (socket) => {
  // بعت الحالة الحالية للجهاز الجديد
  socket.emit('state', state);

  socket.on('play', (videoId) => {
    state = { videoId, playing: true, startTime: Date.now() };
    io.emit('state', state);
  });

  socket.on('pause', () => {
    state.playing = false;
    io.emit('state', state);
  });

  socket.on('stop', () => {
    state = { videoId: null, playing: false, startTime: 0 };
    io.emit('state', state);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
