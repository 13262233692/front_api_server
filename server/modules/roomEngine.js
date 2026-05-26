const { randomUUID } = require('crypto');

class RoomEngine {
  constructor(persistence) {
    this.persistence = persistence;
  }

  getState(roomId) {
    return this.persistence.serializeRoom(roomId);
  }

  ensureDefaultLayer(roomId) {
    const room = this.persistence.getRoom(roomId);
    if (room.layers.length === 0) {
      const defaultLayer = {
        id: randomUUID(),
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        pixels: new Map(),
      };
      room.layers.push(defaultLayer);
      room.activeLayerId = defaultLayer.id;
    }
    return room;
  }

  handleDraw(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { x, y, color, layerId } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    const key = `${x},${y}`;
    if (color === null || color === undefined) {
      layer.pixels.delete(key);
    } else {
      layer.pixels.set(key, color);
    }

    return { type: 'draw', x, y, color, layerId };
  }

  handleLayerCreate(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { name } = payload;
    const newLayer = {
      id: randomUUID(),
      name: name || `Layer ${room.layers.length + 1}`,
      visible: true,
      opacity: 1,
      pixels: new Map(),
    };
    room.layers.push(newLayer);
    room.activeLayerId = newLayer.id;

    return {
      type: 'layer_create',
      layer: {
        id: newLayer.id,
        name: newLayer.name,
        visible: newLayer.visible,
        opacity: newLayer.opacity,
        pixels: {},
      },
    };
  }

  handleLayerDelete(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId } = payload;
    const idx = room.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return null;
    if (room.layers.length <= 1) return null;

    room.layers.splice(idx, 1);
    if (room.activeLayerId === layerId) {
      room.activeLayerId = room.layers[0].id;
    }

    return { type: 'layer_delete', layerId, activeLayerId: room.activeLayerId };
  }

  handleLayerSwitch(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    room.activeLayerId = layerId;
    return { type: 'layer_switch', layerId };
  }

  handleLayerOpacity(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId, opacity } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    layer.opacity = Math.max(0, Math.min(1, opacity));
    return { type: 'layer_opacity', layerId, opacity: layer.opacity };
  }

  handleLayerVisible(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId, visible } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    layer.visible = visible;
    return { type: 'layer_visible', layerId, visible };
  }

  handleLayerRename(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId, name } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    layer.name = name;
    return { type: 'layer_rename', layerId, name };
  }

  handleClearLayer(roomId, payload) {
    const room = this.persistence.getRoom(roomId);
    const { layerId } = payload;
    const layer = room.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    layer.pixels.clear();
    return { type: 'clear_layer', layerId };
  }

  processOperation(roomId, operation) {
    this.ensureDefaultLayer(roomId);
    const handlers = {
      draw: this.handleDraw.bind(this),
      layer_create: this.handleLayerCreate.bind(this),
      layer_delete: this.handleLayerDelete.bind(this),
      layer_switch: this.handleLayerSwitch.bind(this),
      layer_opacity: this.handleLayerOpacity.bind(this),
      layer_visible: this.handleLayerVisible.bind(this),
      layer_rename: this.handleLayerRename.bind(this),
      clear_layer: this.handleClearLayer.bind(this),
    };

    const handler = handlers[operation.type];
    if (!handler) return null;
    return handler(roomId, operation);
  }
}

module.exports = RoomEngine;
