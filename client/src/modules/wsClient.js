class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.connected = false;
    this.clientId = '';
    this.roomId = '';
    this.userName = '';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  _generateClientId() {
    return 'c_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  connect(roomId, userName) {
    return new Promise((resolve, reject) => {
      this.roomId = roomId;
      this.userName = userName;
      if (!this.clientId) {
        this.clientId = this._generateClientId();
      }

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${location.host}/?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(userName)}`;

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('disconnected');
        this.scheduleReconnect(roomId, userName);
      };

      this.ws.onerror = (err) => {
        this.emit('error', err);
        if (!this.connected) reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit(msg.type, msg);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };
    });
  }

  scheduleReconnect(roomId, userName) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    setTimeout(() => {
      this.emit('reconnecting', { attempt: this.reconnectAttempts });
      this.connect(roomId, userName).catch(() => {});
    }, delay);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        cb(data);
      }
    }
  }

  sendOperation(type, payload) {
    if (!this.connected || this.ws.readyState !== 1) return;
    const op = { type, ...payload, clientId: this.clientId };
    this.ws.send(JSON.stringify({ type: 'operation', payload: op }));
  }

  sendChat(message) {
    if (!this.connected || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'chat', message }));
  }

  getHistory() {
    if (!this.connected || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'get_history' }));
  }

  isOwnOperation(msg) {
    return msg && msg.payload && msg.payload.clientId === this.clientId;
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.connected = false;
  }
}

export const wsClient = new WebSocketClient();
