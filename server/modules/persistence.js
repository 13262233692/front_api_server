class Persistence {
  constructor() {
    this.rooms = new Map();
  }

  getRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        width: 32,
        height: 32,
        layers: [],
        activeLayerId: null,
        users: new Map(),
        createdAt: Date.now(),
      });
    }
    return this.rooms.get(roomId);
  }

  saveRoomState(roomId, state) {
    const room = this.getRoom(roomId);
    Object.assign(room, state);
    return room;
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  addUser(roomId, userId, userName) {
    const room = this.getRoom(roomId);
    room.users.set(userId, { id: userId, name: userName, joinedAt: Date.now() });
    return room;
  }

  removeUser(roomId, userId) {
    const room = this.getRoom(roomId);
    room.users.delete(userId);
    return room;
  }

  getUsers(roomId) {
    const room = this.getRoom(roomId);
    return Array.from(room.users.values());
  }

  serializeRoom(roomId) {
    const room = this.getRoom(roomId);
    return {
      id: room.id,
      width: room.width,
      height: room.height,
      layers: room.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        pixels: Object.fromEntries(l.pixels),
      })),
      activeLayerId: room.activeLayerId,
      users: Array.from(room.users.values()),
    };
  }
}

module.exports = Persistence;
