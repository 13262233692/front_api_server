import { wsClient } from './wsClient.js';

class PixelCanvas {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.pixelSize = 20;
    this.gridWidth = 32;
    this.gridHeight = 32;
    this.layers = [];
    this.activeLayerId = null;
    this.currentTool = 'pencil';
    this.currentColor = '#000000';
    this.isDrawing = false;
    this.lastPixel = null;
    this.showGrid = true;
    this.onLayersChange = null;
    this.pendingLocalOps = new Set();
    this.playbackMode = false;
    this.originalLayers = null;
    this.originalActiveLayerId = null;
    this.playbackLayers = null;
    this.playbackActiveLayerId = null;
    this.onPlaybackStateChange = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    this._init();
  }

  _init() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pixel-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._resize();
  }

  _resize() {
    const maxSize = Math.min(this.container.clientWidth, this.container.clientHeight, 640);
    this.pixelSize = Math.floor(maxSize / Math.max(this.gridWidth, this.gridHeight));
    this.canvas.width = this.gridWidth * this.pixelSize;
    this.canvas.height = this.gridHeight * this.pixelSize;
    this.render();
  }

  setState(state) {
    this.gridWidth = state.width;
    this.gridHeight = state.height;
    this.layers = state.layers.map((l) => ({
      ...l,
      pixels: new Map(Object.entries(l.pixels || {})),
    }));
    this.activeLayerId = state.activeLayerId;
    this._resize();
    this._notifyLayersChange();
  }

  _notifyLayersChange() {
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayersSnapshot());
    }
  }

  getLayersSnapshot() {
    return this.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      pixels: l.pixels,
    }));
  }

  setActiveLayer(layerId) {
    this.activeLayerId = layerId;
    this._notifyLayersChange();
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
  }

  toggleGrid(show) {
    this.showGrid = show;
    this.render();
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const renderLayers = this._getRenderLayers();
    for (const layer of renderLayers) {
      if (!layer.visible) continue;
      this.ctx.globalAlpha = layer.opacity;
      for (const [key, color] of layer.pixels) {
        const [x, y] = key.split(',').map(Number);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
      }
    }
    this.ctx.globalAlpha = 1;

    if (this.showGrid) {
      this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      this.ctx.lineWidth = 1;
      for (let x = 0; x <= this.gridWidth; x++) {
        this.ctx.beginPath();
        this.ctx.moveTo(x * this.pixelSize + 0.5, 0);
        this.ctx.lineTo(x * this.pixelSize + 0.5, this.canvas.height);
        this.ctx.stroke();
      }
      for (let y = 0; y <= this.gridHeight; y++) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y * this.pixelSize + 0.5);
        this.ctx.lineTo(this.canvas.width, y * this.pixelSize + 0.5);
        this.ctx.stroke();
      }
    }
  }

  _getPixelFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.pixelSize);
    const y = Math.floor((e.clientY - rect.top) / this.pixelSize);
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return null;
    return { x, y };
  }

  _applyPixel(x, y) {
    const color = this.currentTool === 'eraser' ? null : this.currentColor;
    const key = `${x},${y}`;
    const activeLayer = this.layers.find((l) => l.id === this.activeLayerId);
    if (!activeLayer) return;

    if (color === null) {
      activeLayer.pixels.delete(key);
    } else {
      activeLayer.pixels.set(key, color);
    }

    wsClient.sendOperation('draw', { x, y, color, layerId: this.activeLayerId });
    this.render();
  }

  _onMouseDown(e) {
    if (this.playbackMode) return;
    e.preventDefault();
    if (e.button === 2) {
      this.setTool('eraser');
    }
    this.isDrawing = true;
    const pixel = this._getPixelFromEvent(e);
    if (pixel) {
      this._applyPixel(pixel.x, pixel.y);
      this.lastPixel = pixel;
    }
  }

  _onMouseMove(e) {
    if (!this.isDrawing) return;
    const pixel = this._getPixelFromEvent(e);
    if (!pixel) return;

    if (this.lastPixel && (this.lastPixel.x !== pixel.x || this.lastPixel.y !== pixel.y)) {
      this._drawLine(this.lastPixel.x, this.lastPixel.y, pixel.x, pixel.y);
    } else if (!this.lastPixel || this.lastPixel.x !== pixel.x || this.lastPixel.y !== pixel.y) {
      this._applyPixel(pixel.x, pixel.y);
    }
    this.lastPixel = pixel;
  }

  _onMouseUp() {
    this.isDrawing = false;
    this.lastPixel = null;
    if (this.currentTool === 'eraser') {
      this.setTool('pencil');
    }
  }

  _onMouseLeave() {
    this.isDrawing = false;
    this.lastPixel = null;
  }

  _drawLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this._applyPixel(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  createLayer(name) {
    if (this.playbackMode) return;
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'ly_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const layerName = name || `Layer ${this.layers.length + 1}`;
    const newLayer = {
      id,
      name: layerName,
      visible: true,
      opacity: 1,
      pixels: new Map(),
    };
    this.layers.push(newLayer);
    this.activeLayerId = id;

    wsClient.sendOperation('layer_create', { name: layerName, id });

    this.render();
    this._notifyLayersChange();
    return newLayer;
  }

  switchLayer(layerId) {
    if (this.playbackMode) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.activeLayerId = layerId;
    wsClient.sendOperation('layer_switch', { layerId });
    this._notifyLayersChange();
  }

  deleteLayer(layerId) {
    if (this.playbackMode) return;
    if (this.layers.length <= 1) return;
    const idx = this.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;

    this.layers.splice(idx, 1);
    if (this.activeLayerId === layerId) {
      this.activeLayerId = this.layers[0].id;
    }

    wsClient.sendOperation('layer_delete', { layerId });

    this.render();
    this._notifyLayersChange();
  }

  setLayerOpacity(layerId, opacity) {
    if (this.playbackMode) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.opacity = Math.max(0, Math.min(1, opacity));

    wsClient.sendOperation('layer_opacity', { layerId, opacity: layer.opacity });

    this.render();
    this._notifyLayersChange();
  }

  setLayerVisible(layerId, visible) {
    if (this.playbackMode) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.visible = visible;

    wsClient.sendOperation('layer_visible', { layerId, visible });

    this.render();
    this._notifyLayersChange();
  }

  renameLayer(layerId, name) {
    if (this.playbackMode) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.name = name;

    wsClient.sendOperation('layer_rename', { layerId, name });

    this._notifyLayersChange();
  }

  clearLayer(layerId) {
    if (this.playbackMode) return;
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.pixels.clear();

    wsClient.sendOperation('clear_layer', { layerId });

    this.render();
    this._notifyLayersChange();
  }

  applyRemoteOperation(payload, isOwn) {
    if (isOwn && payload.type !== 'draw') {
      if (payload.type === 'layer_create') {
        return;
      }
      if (payload.type === 'layer_delete') {
        return;
      }
      if (payload.type === 'layer_switch') {
        return;
      }
      if (payload.type === 'layer_opacity') {
        return;
      }
      if (payload.type === 'layer_visible') {
        return;
      }
      if (payload.type === 'layer_rename') {
        return;
      }
      if (payload.type === 'clear_layer') {
        return;
      }
    }

    switch (payload.type) {
      case 'draw': {
        if (isOwn) return;
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (!layer) return;
        const key = `${payload.x},${payload.y}`;
        if (payload.color === null || payload.color === undefined) {
          layer.pixels.delete(key);
        } else {
          layer.pixels.set(key, payload.color);
        }
        this.render();
        break;
      }
      case 'layer_create': {
        const existing = this.layers.find((l) => l.id === payload.layer.id);
        if (existing) return;
        this.layers.push({
          ...payload.layer,
          pixels: new Map(Object.entries(payload.layer.pixels || {})),
        });
        this.activeLayerId = payload.layer.id;
        this.render();
        this._notifyLayersChange();
        break;
      }
      case 'layer_delete': {
        const idx = this.layers.findIndex((l) => l.id === payload.layerId);
        if (idx !== -1) this.layers.splice(idx, 1);
        if (payload.activeLayerId) this.activeLayerId = payload.activeLayerId;
        this.render();
        this._notifyLayersChange();
        break;
      }
      case 'layer_switch': {
        this.activeLayerId = payload.layerId;
        this._notifyLayersChange();
        break;
      }
      case 'layer_opacity': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.opacity = payload.opacity;
        this.render();
        this._notifyLayersChange();
        break;
      }
      case 'layer_visible': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.visible = payload.visible;
        this.render();
        this._notifyLayersChange();
        break;
      }
      case 'layer_rename': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.name = payload.name;
        this._notifyLayersChange();
        break;
      }
      case 'clear_layer': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.pixels.clear();
        this.render();
        break;
      }
    }
  }

  startPlayback() {
    if (this.playbackMode) return;
    this.originalLayers = this._cloneLayers(this.layers);
    this.originalActiveLayerId = this.activeLayerId;
    this.playbackLayers = this._cloneLayers(this.layers);
    this.playbackActiveLayerId = this.activeLayerId;
    this.playbackMode = true;
    this._notifyPlaybackChange();
    this.render();
  }

  stopPlayback() {
    if (!this.playbackMode) return;
    this.playbackMode = false;
    if (this.originalLayers) {
      this.layers = this.originalLayers;
      this.activeLayerId = this.originalActiveLayerId;
    }
    this.originalLayers = null;
    this.originalActiveLayerId = null;
    this.playbackLayers = null;
    this.playbackActiveLayerId = null;
    this._notifyPlaybackChange();
    this.render();
    this._notifyLayersChange();
  }

  replayTo(history, endIndex) {
    if (!this.playbackMode) return;
    const emptyRoom = {
      width: this.gridWidth,
      height: this.gridHeight,
      layers: [],
      activeLayerId: null,
    };
    for (let i = 0; i <= endIndex && i < history.length; i++) {
      this._applyOperationToState(emptyRoom, history[i]);
    }
    this.playbackLayers = emptyRoom.layers.map((l) => ({
      ...l,
      pixels: new Map(Object.entries(l.pixels || {})),
    }));
    this.playbackActiveLayerId = emptyRoom.activeLayerId;
    this.render();
  }

  _cloneLayers(layers) {
    return layers.map((l) => ({
      ...l,
      pixels: new Map(l.pixels),
    }));
  }

  _applyOperationToState(state, op) {
    switch (op.type) {
      case 'draw': {
        const layer = state.layers.find((l) => l.id === op.layerId);
        if (!layer) return;
        const key = `${op.x},${op.y}`;
        if (op.color === null || op.color === undefined) {
          layer.pixels.delete(key);
        } else {
          layer.pixels.set(key, op.color);
        }
        break;
      }
      case 'layer_create': {
        state.layers.push({
          id: op.layer.id,
          name: op.layer.name,
          visible: op.layer.visible,
          opacity: op.layer.opacity,
          pixels: new Map(Object.entries(op.layer.pixels || {})),
        });
        state.activeLayerId = op.layer.id;
        break;
      }
      case 'layer_delete': {
        const idx = state.layers.findIndex((l) => l.id === op.layerId);
        if (idx !== -1) state.layers.splice(idx, 1);
        if (op.activeLayerId) state.activeLayerId = op.activeLayerId;
        break;
      }
      case 'layer_switch': {
        state.activeLayerId = op.layerId;
        break;
      }
      case 'layer_opacity': {
        const layer = state.layers.find((l) => l.id === op.layerId);
        if (layer) layer.opacity = op.opacity;
        break;
      }
      case 'layer_visible': {
        const layer = state.layers.find((l) => l.id === op.layerId);
        if (layer) layer.visible = op.visible;
        break;
      }
      case 'layer_rename': {
        const layer = state.layers.find((l) => l.id === op.layerId);
        if (layer) layer.name = op.name;
        break;
      }
      case 'clear_layer': {
        const layer = state.layers.find((l) => l.id === op.layerId);
        if (layer) layer.pixels.clear();
        break;
      }
    }
  }

  _notifyPlaybackChange() {
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(this.playbackMode);
    }
  }

  _getRenderLayers() {
    return this.playbackMode ? this.playbackLayers : this.layers;
  }

  destroy() {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('mouseup', this._onMouseUp);
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
      this.canvas.remove();
    }
  }
}

export { PixelCanvas };
