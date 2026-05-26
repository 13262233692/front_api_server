const http = require('http');
const fs = require('fs');
const path = require('path');
const Persistence = require('./modules/persistence');
const RoomEngine = require('./modules/roomEngine');
const ConnectionManager = require('./modules/connectionManager');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(CLIENT_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

const persistence = new Persistence();
const roomEngine = new RoomEngine(persistence);
const connManager = new ConnectionManager(server, roomEngine, persistence);
connManager.startHeartbeat();

server.listen(PORT, () => {
  console.log(`Pixel Collab Server running at http://localhost:${PORT}`);
});
