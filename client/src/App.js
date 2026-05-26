import { wsClient } from './modules/wsClient.js';
import { PixelCanvas } from './modules/canvas.js';
import { Toolbar } from './modules/toolbar.js';
import { LayerPanel } from './modules/layerPanel.js';
import { StatusBar } from './modules/statusBar.js';
import { TimeMachine } from './modules/timeMachine.js';

class App {
  constructor() {
    this.pixelCanvas = null;
    this.toolbar = null;
    this.layerPanel = null;
    this.statusBar = null;
    this.roomId = '';
    this.userName = '';
  }

  init() {
    this._showJoinScreen();
  }

  _showJoinScreen() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="join-screen">
        <div class="join-card">
          <h1 class="join-title">Pixel Collab</h1>
          <p class="join-subtitle">Real-time Collaborative Pixel Art</p>
          <div class="join-form">
            <div class="form-group">
              <label>Room ID</label>
              <input type="text" id="roomInput" placeholder="e.g. my-room-123" value="${this._getDefaultRoom()}">
            </div>
            <div class="form-group">
              <label>Your Name</label>
              <input type="text" id="nameInput" placeholder="e.g. Alice" value="${this._getDefaultName()}" maxlength="16">
            </div>
            <button class="join-btn" id="joinBtn">Join Room</button>
          </div>
          <p class="join-hint">Enter the same room ID to collaborate with others.</p>
        </div>
      </div>
    `;

    document.getElementById('joinBtn').addEventListener('click', () => this._handleJoin());
    document.getElementById('nameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._handleJoin();
    });
    document.getElementById('roomInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._handleJoin();
    });
  }

  _getDefaultRoom() {
    const params = new URLSearchParams(location.search);
    return params.get('room') || 'demo-room';
  }

  _getDefaultName() {
    const params = new URLSearchParams(location.search);
    return params.get('name') || `User_${Math.floor(Math.random() * 1000)}`;
  }

  async _handleJoin() {
    const roomId = document.getElementById('roomInput').value.trim();
    const userName = document.getElementById('nameInput').value.trim() || 'Anonymous';

    if (!roomId) {
      alert('Please enter a room ID.');
      return;
    }

    this.roomId = roomId;
    this.userName = userName;

    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    url.searchParams.set('name', userName);
    history.replaceState({}, '', url.toString());

    this._showEditor();

    this.statusBar.setRoomInfo(roomId, userName);
    this.statusBar.setStatus('connecting');

    try {
      await wsClient.connect(roomId, userName);
    } catch (e) {
      console.error('Connection failed:', e);
      this.statusBar.setStatus('disconnected');
    }
  }

  _showEditor() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="status-bar" id="statusBar"></div>
      <div class="editor-layout">
        <div class="left-panel">
          <div class="toolbar-panel" id="toolbarPanel"></div>
          <div class="time-machine-container" id="timeMachineContainer"></div>
        </div>
        <div class="canvas-container" id="canvasContainer">
          <div class="canvas-wrapper" id="canvasWrapper"></div>
        </div>
        <div class="right-panel">
          <div class="layer-panel" id="layerPanel"></div>
        </div>
      </div>
    `;

    this.statusBar = new StatusBar(document.getElementById('statusBar'));
    this.toolbar = new Toolbar(document.getElementById('toolbarPanel'));
    this.pixelCanvas = new PixelCanvas(document.getElementById('canvasWrapper'));
    this.layerPanel = new LayerPanel(document.getElementById('layerPanel'));
    this.timeMachine = new TimeMachine(document.getElementById('timeMachineContainer'));

    this.layerPanel.setPixelCanvas(this.pixelCanvas);
    this.timeMachine.setPixelCanvas(this.pixelCanvas);

    this.toolbar.onToolChange = (tool) => this.pixelCanvas.setTool(tool);
    this.toolbar.onColorChange = (color) => this.pixelCanvas.setColor(color);
    this.toolbar.onGridToggle = (show) => this.pixelCanvas.toggleGrid(show);

    this._setupWebSocketHandlers();
  }

  _setupWebSocketHandlers() {
    wsClient.on('connected', () => {
      this.statusBar.setStatus('connected');
    });

    wsClient.on('disconnected', () => {
      this.statusBar.setStatus('disconnected');
    });

    wsClient.on('reconnecting', () => {
      this.statusBar.setStatus('reconnecting');
    });

    wsClient.on('state_sync', (msg) => {
      this.pixelCanvas.setState(msg.state);
      this.statusBar.setUsers(msg.state.users);
    });

    wsClient.on('operation', (msg) => {
      const isOwn = wsClient.isOwnOperation(msg);
      this.pixelCanvas.applyRemoteOperation(msg.payload, isOwn);
    });

    wsClient.on('user_join', (msg) => {
      this.statusBar.setUsers(msg.users);
    });

    wsClient.on('user_leave', (msg) => {
      this.statusBar.setUsers(msg.users);
    });
  }

  destroy() {
    if (this.pixelCanvas) this.pixelCanvas.destroy();
    if (this.toolbar) this.toolbar.destroy();
    if (this.layerPanel) this.layerPanel.destroy();
    if (this.statusBar) this.statusBar.destroy();
    if (this.timeMachine) this.timeMachine.destroy();
    wsClient.disconnect();
  }
}

export const app = new App();
