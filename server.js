const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// رفع الفيديو
const storage = multer.diskStorage({
  destination: 'public/videos/',
  filename: (req, file, cb) => cb(null, 'video.mp4')
});
const upload = multer({ storage });

app.use(express.static('public'));

// endpoint لرفع الفيديو
app.post('/upload', upload.single('video'), (req, res) => {
  res.json({ success: true });
});

let isPlaying = false;

io.on('connection', (socket) => {
  socket.emit('state', { playing: isPlaying });
  socket.on('play', () => { isPlaying = true; io.emit('state', { playing: true }); });
  socket.on('pause', () => { isPlaying = false; io.emit('state', { playing: false }); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
