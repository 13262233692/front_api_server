import { wsClient } from './wsClient.js';

class LayerPanel {
  constructor(container) {
    this.container = container;
    this.layers = [];
    this.activeLayerId = null;
    this.onLayerChange = null;
    this.onActiveLayerChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="layer-header">
        <h3 class="panel-title">Layers</h3>
        <div class="layer-actions">
          <button class="layer-btn" id="addLayerBtn" title="New Layer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="layer-list" id="layerList"></div>
    `;

    this.container.querySelector('#addLayerBtn').addEventListener('click', () => {
      const name = prompt('Layer name:', `Layer ${this.layers.length + 1}`);
      if (name !== null) {
        wsClient.sendOperation('layer_create', { name });
      }
    });
  }

  setState(layers, activeLayerId) {
    this.layers = layers.map((l) => ({
      ...l,
      pixels: l.pixels instanceof Map ? l.pixels : new Map(Object.entries(l.pixels || {})),
    }));
    this.activeLayerId = activeLayerId;
    this._render();
  }

  _render() {
    const list = this.container.querySelector('#layerList');
    if (!list) return;
    list.innerHTML = '';

    const reversed = [...this.layers].reverse();
    for (const layer of reversed) {
      const item = this._createLayerItem(layer);
      list.appendChild(item);
    }
  }

  _createLayerItem(layer) {
    const item = document.createElement('div');
    item.className = 'layer-item';
    if (layer.id === this.activeLayerId) item.classList.add('active');
    item.dataset.layerId = layer.id;

    item.innerHTML = `
      <div class="layer-row">
        <button class="layer-visibility" data-action="visibility" title="Toggle Visibility">
          ${layer.visible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>'
          }
        </button>
        <span class="layer-name" data-action="rename" title="Double-click to rename">${layer.name}</span>
        <button class="layer-delete" data-action="delete" title="Delete Layer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
      <div class="layer-opacity-row">
        <span class="opacity-label">Opacity</span>
        <input type="range" class="opacity-slider" min="0" max="100" value="${Math.round(layer.opacity * 100)}" data-action="opacity">
        <span class="opacity-value">${Math.round(layer.opacity * 100)}%</span>
      </div>
    `;

    item.querySelector('.layer-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      wsClient.sendOperation('layer_visible', { layerId: layer.id, visible: !layer.visible });
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.layers.length <= 1) {
        alert('Cannot delete the last layer.');
        return;
      }
      if (confirm(`Delete layer "${layer.name}"?`)) {
        wsClient.sendOperation('layer_delete', { layerId: layer.id });
      }
    });

    const nameEl = item.querySelector('.layer-name');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const newName = prompt('Rename layer:', layer.name);
      if (newName && newName.trim()) {
        wsClient.sendOperation('layer_rename', { layerId: layer.id, name: newName.trim() });
      }
    });

    const opacitySlider = item.querySelector('.opacity-slider');
    opacitySlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const opacity = parseInt(e.target.value) / 100;
      item.querySelector('.opacity-value').textContent = `${e.target.value}%`;
      wsClient.sendOperation('layer_opacity', { layerId: layer.id, opacity });
    });

    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      wsClient.sendOperation('layer_switch', { layerId: layer.id });
    });

    return item;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

export { LayerPanel };
