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
  }

  setActiveLayer(layerId) {
    this.activeLayerId = layerId;
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

    for (const layer of this.layers) {
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

  applyRemoteOperation(payload) {
    switch (payload.type) {
      case 'draw': {
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
        this.layers.push({
          ...payload.layer,
          pixels: new Map(Object.entries(payload.layer.pixels || {})),
        });
        this.activeLayerId = payload.layer.id;
        this.render();
        break;
      }
      case 'layer_delete': {
        const idx = this.layers.findIndex((l) => l.id === payload.layerId);
        if (idx !== -1) this.layers.splice(idx, 1);
        if (payload.activeLayerId) this.activeLayerId = payload.activeLayerId;
        this.render();
        break;
      }
      case 'layer_switch': {
        this.activeLayerId = payload.layerId;
        break;
      }
      case 'layer_opacity': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.opacity = payload.opacity;
        this.render();
        break;
      }
      case 'layer_visible': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.visible = payload.visible;
        this.render();
        break;
      }
      case 'layer_rename': {
        const layer = this.layers.find((l) => l.id === payload.layerId);
        if (layer) layer.name = payload.name;
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
