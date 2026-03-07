const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let isPlaying = false;

io.on('connection', (socket) => {
  socket.emit('state', { playing: isPlaying });

  socket.on('play', () => {
    isPlaying = true;
    io.emit('state', { playing: true });
  });

  socket.on('pause', () => {
    isPlaying = false;
    io.emit('state', { playing: false });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
