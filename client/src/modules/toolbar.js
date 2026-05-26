import { wsClient } from './wsClient.js';

const DEFAULT_COLORS = [
  '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
  '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF', '#808080',
  '#800000', '#808000', '#008000', '#800080', '#008080', '#000080', '#FFC0CB', '#A52A2A',
];

class Toolbar {
  constructor(container) {
    this.container = container;
    this.currentTool = 'pencil';
    this.currentColor = '#000000';
    this.onToolChange = null;
    this.onColorChange = null;
    this.onGridToggle = null;
    this.showGrid = true;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="toolbar-section">
        <h3 class="toolbar-title">Tools</h3>
        <div class="tool-buttons">
          <button class="tool-btn active" data-tool="pencil" title="Pencil (Left Click)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button class="tool-btn" data-tool="eraser" title="Eraser (Right Click)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.78-.78-2.05 0-2.83l10.6-10.6c.78-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.78 2.05.78 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"/>
            </svg>
          </button>
          <button class="tool-btn" id="gridToggle" title="Toggle Grid">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="toolbar-section">
        <h3 class="toolbar-title">Palette</h3>
        <div class="color-palette" id="colorPalette"></div>
        <div class="color-custom">
          <label>Custom:</label>
          <input type="color" id="customColor" value="#000000">
        </div>
      </div>

      <div class="toolbar-section">
        <h3 class="toolbar-title">Current</h3>
        <div class="current-color-display">
          <div class="color-swatch" id="colorSwatch"></div>
          <span id="colorHex">#000000</span>
        </div>
      </div>
    `;

    this._buildPalette();
    this._bindEvents();
    this._updateSwatch();
  }

  _buildPalette() {
    const palette = this.container.querySelector('#colorPalette');
    DEFAULT_COLORS.forEach((color, i) => {
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.style.backgroundColor = color;
      btn.dataset.color = color;
      btn.title = color;
      if (i === 0) btn.classList.add('active');
      palette.appendChild(btn);
    });
  }

  _bindEvents() {
    this.container.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTool(btn.dataset.tool);
      });
    });

    const gridBtn = this.container.querySelector('#gridToggle');
    gridBtn.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      gridBtn.classList.toggle('active', this.showGrid);
      if (this.onGridToggle) this.onGridToggle(this.showGrid);
    });
    gridBtn.classList.add('active');

    this.container.querySelectorAll('.color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setColor(btn.dataset.color);
      });
    });

    const customColor = this.container.querySelector('#customColor');
    customColor.addEventListener('input', (e) => {
      this.setColor(e.target.value);
    });
  }

  setTool(tool) {
    this.currentTool = tool;
    this.container.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    if (this.onToolChange) this.onToolChange(tool);
  }

  setColor(color) {
    this.currentColor = color;
    this.container.querySelectorAll('.color-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === color.toLowerCase());
    });
    this.container.querySelector('#customColor').value = color;
    this._updateSwatch();
    if (this.onColorChange) this.onColorChange(color);
  }

  _updateSwatch() {
    const swatch = this.container.querySelector('#colorSwatch');
    const hex = this.container.querySelector('#colorHex');
    if (swatch) swatch.style.backgroundColor = this.currentColor;
    if (hex) hex.textContent = this.currentColor.toUpperCase();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

export { Toolbar };
