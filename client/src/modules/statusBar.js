class StatusBar {
  constructor(container) {
    this.container = container;
    this.users = [];
    this.status = 'connecting';
    this.roomId = '';
    this.userName = '';
    this.latency = 0;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="status-left">
        <span class="status-indicator" id="statusIndicator"></span>
        <span class="status-text" id="statusText">Connecting...</span>
      </div>
      <div class="status-center">
        <span class="room-info">Room: <strong id="roomId">--</strong></span>
        <span class="user-info">User: <strong id="userName">--</strong></span>
      </div>
      <div class="status-right">
        <span class="latency">Latency: <span id="latency">--</span> ms</span>
        <div class="user-list" id="userList"></div>
      </div>
    `;
  }

  setRoomInfo(roomId, userName) {
    this.roomId = roomId;
    this.userName = userName;
    this.container.querySelector('#roomId').textContent = roomId;
    this.container.querySelector('#userName').textContent = userName;
  }

  setStatus(status) {
    this.status = status;
    const indicator = this.container.querySelector('#statusIndicator');
    const text = this.container.querySelector('#statusText');
    const configs = {
      connected: { color: '#00E436', text: 'Connected' },
      disconnected: { color: '#FF004D', text: 'Disconnected' },
      connecting: { color: '#FFA300', text: 'Connecting...' },
      reconnecting: { color: '#FFA300', text: 'Reconnecting...' },
    };
    const config = configs[status] || configs.connecting;
    indicator.style.backgroundColor = config.color;
    text.textContent = config.text;
  }

  setUsers(users) {
    this.users = users;
    const list = this.container.querySelector('#userList');
    list.innerHTML = '';
    users.forEach((user) => {
      const badge = document.createElement('span');
      badge.className = 'user-badge';
      if (user.name === this.userName) badge.classList.add('self');
      const colors = ['#FF004D', '#00E436', '#29ADFF', '#FFA300', '#FF77A8', '#FFEC27', '#83769C'];
      const hash = user.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      badge.style.backgroundColor = colors[hash % colors.length];
      badge.textContent = user.name.charAt(0).toUpperCase();
      badge.title = user.name;
      list.appendChild(badge);
    });
  }

  setLatency(ms) {
    this.latency = ms;
    this.container.querySelector('#latency').textContent = ms;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

export { StatusBar };
