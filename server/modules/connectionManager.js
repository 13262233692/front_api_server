const crypto = require('crypto');
const http = require('http');

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5AC8DC51B';

function createAcceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
}

function parseFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = buffer.readUInt32BE(6) * 0x100000000 + buffer.readUInt32BE(2);
    offset = 10;
  }

  let maskKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;

  let payload = buffer.slice(offset, offset + payloadLength);
  if (masked && maskKey) {
    const unmasked = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      unmasked[i] = payload[i] ^ maskKey[i % 4];
    }
    payload = unmasked;
  }

  return {
    fin,
    opcode,
    masked,
    payloadLength,
    payload,
    frameLength: offset + payloadLength,
  };
}

function buildFrame(data, opcode) {
  const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const payloadLength = payload.length;
  let header;

  if (payloadLength < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(payloadLength >>> 0, 6);
  }

  return Buffer.concat([header, payload]);
}

class WSConnection {
  constructor(socket) {
    this.socket = socket;
    this.readyState = 1;
    this.isAlive = true;
    this.buffer = Buffer.alloc(0);
    this.userId = null;
    this.roomId = null;
    this.userName = null;

    this._onData = this._onData.bind(this);
    this._onClose = this._onClose.bind(this);
    this._onError = this._onError.bind(this);

    socket.on('data', this._onData);
    socket.on('close', this._onClose);
    socket.on('error', this._onError);
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const frame = parseFrame(this.buffer);
      if (!frame) break;

      this.buffer = this.buffer.slice(frame.frameLength);

      if (frame.opcode === 0x8) {
        this.close();
        return;
      } else if (frame.opcode === 0x9) {
        this._sendRaw(buildFrame(frame.payload, 0xa));
      } else if (frame.opcode === 0xa) {
        this.isAlive = true;
      } else if (frame.opcode === 0x1) {
        const text = frame.payload.toString('utf8');
        if (this.onmessage) this.onmessage(text);
      } else if (frame.opcode === 0x2) {
        if (this.onmessage) this.onmessage(frame.payload);
      }
    }
  }

  _onClose() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }

  _onError(err) {
    if (this.onerror) this.onerror(err);
  }

  send(data) {
    if (this.readyState !== 1) return;
    this._sendRaw(buildFrame(data, 0x1));
  }

  _sendRaw(buffer) {
    try {
      this.socket.write(buffer);
    } catch (e) {
      this.close();
    }
  }

  ping() {
    if (this.readyState !== 1) return;
    this._sendRaw(buildFrame(Buffer.alloc(0), 0x9));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try {
      this.socket.end();
    } catch (e) {}
  }

  terminate() {
    try {
      this.socket.destroy();
    } catch (e) {}
  }
}

class ConnectionManager {
  constructor(server, roomEngine, persistence) {
    this.server = server;
    this.roomEngine = roomEngine;
    this.persistence = persistence;
    this.sockets = new Map();

    server.on('upgrade', (req, socket) => this._handleUpgrade(req, socket));
  }

  _handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = createAcceptKey(key);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
    ];

    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const url = new URL(req.url, 'http://localhost');
    const roomId = url.searchParams.get('room') || 'default';
    const userName = url.searchParams.get('name') || 'Anonymous';
    const userId = crypto.randomUUID();

    const ws = new WSConnection(socket);
    ws.userId = userId;
    ws.roomId = roomId;
    ws.userName = userName;

    this.sockets.set(userId, ws);

    this.persistence.addUser(roomId, userId, userName);
    this.roomEngine.ensureDefaultLayer(roomId);

    const state = this.persistence.serializeRoom(roomId);
    ws.send(JSON.stringify({ type: 'state_sync', state }));

    this.broadcastToRoom(roomId, {
      type: 'user_join',
      user: { id: userId, name: userName },
      users: this.persistence.getUsers(roomId),
    });

    ws.onmessage = (data) => this.handleMessage(ws, data);
    ws.onclose = () => this.handleDisconnect(ws);
    ws.onerror = (err) => console.error('WebSocket error:', err);
  }

  handleMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : data.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (msg.type === 'operation') {
      const result = this.roomEngine.processOperation(ws.roomId, msg.payload);
      if (result) {
        this.broadcastToRoom(ws.roomId, {
          type: 'operation',
          payload: result,
          from: ws.userId,
        });
      }
    } else if (msg.type === 'chat') {
      this.broadcastToRoom(ws.roomId, {
        type: 'chat',
        from: ws.userName,
        message: msg.message,
      });
    }
  }

  handleDisconnect(ws) {
    this.sockets.delete(ws.userId);
    this.persistence.removeUser(ws.roomId, ws.userId);

    this.broadcastToRoom(ws.roomId, {
      type: 'user_leave',
      user: { id: ws.userId, name: ws.userName },
      users: this.persistence.getUsers(ws.roomId),
    });
  }

  broadcastToRoom(roomId, message) {
    const data = JSON.stringify(message);
    for (const [userId, socket] of this.sockets) {
      if (socket.roomId === roomId && socket.readyState === 1) {
        socket.send(data);
      }
    }
  }

  startHeartbeat(interval = 30000) {
    this.heartbeat = setInterval(() => {
      for (const [userId, socket] of this.sockets) {
        if (socket.isAlive === false) {
          this.handleDisconnect(socket);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, interval);
  }
}

module.exports = ConnectionManager;
