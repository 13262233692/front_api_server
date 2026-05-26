import { wsClient } from './wsClient.js';

class TimeMachine {
  constructor(container) {
    this.container = container;
    this.pixelCanvas = null;
    this.history = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.playInterval = null;
    this.playSpeed = 500;
    this.isOpen = false;

    this._init();
  }

  setPixelCanvas(pixelCanvas) {
    this.pixelCanvas = pixelCanvas;
    pixelCanvas.onPlaybackStateChange = (isPlayback) => {
      this._updatePlaybackUI(isPlayback);
    };
  }

  _init() {
    this.container.innerHTML = `
      <button class="time-machine-toggle" id="timeMachineToggle" title="Time Machine">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.99 14.29c-.02.12-.11.21-.24.21h-1.5c-.13 0-.22-.09-.24-.21l-.63-5.1c-.01-.1.04-.19.12-.25.08-.06.18-.08.28-.06l1.5.29c.42.08.79.37.92.77.13.4-.07.81-.46.93l-.75.15.68 4.02h.01l1.27-2.21c.16-.28.48-.38.76-.22.28.16.38.48.22.76l-1.64 2.71z"/>
        </svg>
        <span>时光机</span>
      </button>
      <div class="time-machine-panel" id="timeMachinePanel" style="display: none;">
        <div class="tm-header">
          <h3 class="tm-title">⏱ 时光机</h3>
          <button class="tm-close" id="tmClose">×</button>
        </div>
        <div class="tm-info">
          <div class="tm-info-row">
            <span class="tm-label">历史记录:</span>
            <span class="tm-value" id="tmHistoryCount">0 条操作</span>
          </div>
          <div class="tm-info-row">
            <span class="tm-label">当前位置:</span>
            <span class="tm-value" id="tmCurrentPos">--</span>
          </div>
        </div>
        <div class="tm-controls">
          <button class="tm-btn" id="tmPrev" title="上一步">◀</button>
          <button class="tm-btn tm-play" id="tmPlay" title="播放/暂停">▶</button>
          <button class="tm-btn" id="tmNext" title="下一步">▶</button>
          <button class="tm-btn tm-reset" id="tmReset" title="返回最新">⏹</button>
        </div>
        <div class="tm-slider-container">
          <input type="range" class="tm-slider" id="tmSlider" min="0" max="0" value="0" step="1">
          <div class="tm-slider-labels">
            <span>最早</span>
            <span id="tmSliderLabel">0</span>
            <span>最新</span>
          </div>
        </div>
        <div class="tm-speed">
          <span class="tm-label">播放速度:</span>
          <select id="tmSpeed">
            <option value="1000">0.5x</option>
            <option value="500" selected>1x</option>
            <option value="250">2x</option>
            <option value="100">5x</option>
          </select>
        </div>
        <div class="tm-hint">
          💡 拖动滑块可快速回溯到任意历史状态，不影响其他用户。
        </div>
      </div>
    `;

    this.toggleBtn = this.container.querySelector('#timeMachineToggle');
    this.panel = this.container.querySelector('#timeMachinePanel');
    this.slider = this.container.querySelector('#tmSlider');
    this.sliderLabel = this.container.querySelector('#tmSliderLabel');
    this.historyCount = this.container.querySelector('#tmHistoryCount');
    this.currentPos = this.container.querySelector('#tmCurrentPos');
    this.playBtn = this.container.querySelector('#tmPlay');
    this.prevBtn = this.container.querySelector('#tmPrev');
    this.nextBtn = this.container.querySelector('#tmNext');
    this.resetBtn = this.container.querySelector('#tmReset');
    this.closeBtn = this.container.querySelector('#tmClose');
    this.speedSelect = this.container.querySelector('#tmSpeed');

    this.toggleBtn.addEventListener('click', () => this._togglePanel());
    this.closeBtn.addEventListener('click', () => this._togglePanel());

    this.slider.addEventListener('input', (e) => {
      const idx = parseInt(e.target.value);
      this._seekTo(idx);
    });

    this.playBtn.addEventListener('click', () => this._togglePlay());
    this.prevBtn.addEventListener('click', () => this._step(-1));
    this.nextBtn.addEventListener('click', () => this._step(1));
    this.resetBtn.addEventListener('click', () => this._resetToLatest());

    this.speedSelect.addEventListener('change', (e) => {
      this.playSpeed = parseInt(e.target.value);
      if (this.isPlaying) {
        this._stopPlayback();
        this._startPlayback();
      }
    });
  }

  _togglePanel() {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) {
      wsClient.getHistory();
      wsClient.on('history', this._onHistoryReceived);
    } else {
      wsClient.off('history', this._onHistoryReceived);
      this._resetToLatest();
    }
  }

  _onHistoryReceived = (msg) => {
    this.history = msg.history || [];
    this.currentIndex = this.history.length - 1;
    this._updateUI();
  };

  _updateUI() {
    const max = Math.max(0, this.history.length - 1);
    this.slider.max = max;
    this.slider.value = this.currentIndex >= 0 ? this.currentIndex : 0;
    this.sliderLabel.textContent = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    this.historyCount.textContent = `${this.history.length} 条操作`;

    if (this.currentIndex >= 0 && this.history[this.currentIndex]) {
      const op = this.history[this.currentIndex];
      const time = new Date(op.timestamp).toLocaleTimeString();
      this.currentPos.textContent = `#${this.currentIndex + 1} ${op.type} (${time})`;
    } else {
      this.currentPos.textContent = '--';
    }
  }

  _updatePlaybackUI(isPlayback) {
    if (isPlayback) {
      this.container.classList.add('in-playback');
      this.toggleBtn.classList.add('active');
    } else {
      this.container.classList.remove('in-playback');
      this.toggleBtn.classList.remove('active');
    }
  }

  _seekTo(index) {
    if (index < 0 || index >= this.history.length) return;
    this.currentIndex = index;

    if (!this.pixelCanvas.playbackMode) {
      this.pixelCanvas.startPlayback();
    }

    this.pixelCanvas.replayTo(this.history, index);
    this._updateUI();
  }

  _step(direction) {
    if (this.history.length === 0) return;
    let newIndex = this.currentIndex + direction;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.history.length) newIndex = this.history.length - 1;
    this._seekTo(newIndex);
  }

  _togglePlay() {
    if (this.isPlaying) {
      this._stopPlayback();
    } else {
      this._startPlayback();
    }
  }

  _startPlayback() {
    if (this.history.length === 0) return;
    this.isPlaying = true;
    this.playBtn.textContent = '⏸';
    this.playBtn.classList.add('playing');

    if (this.currentIndex >= this.history.length - 1) {
      this.currentIndex = -1;
    }

    this.playInterval = setInterval(() => {
      if (this.currentIndex < this.history.length - 1) {
        this._seekTo(this.currentIndex + 1);
      } else {
        this._stopPlayback();
      }
    }, this.playSpeed);
  }

  _stopPlayback() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶';
    this.playBtn.classList.remove('playing');
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  _resetToLatest() {
    this._stopPlayback();
    if (this.pixelCanvas && this.pixelCanvas.playbackMode) {
      this.pixelCanvas.stopPlayback();
    }
    this.currentIndex = this.history.length - 1;
    this._updateUI();
  }

  destroy() {
    this._stopPlayback();
    wsClient.off('history', this._onHistoryReceived);
    if (this.pixelCanvas && this.pixelCanvas.playbackMode) {
      this.pixelCanvas.stopPlayback();
    }
    this.container.innerHTML = '';
  }
}

export { TimeMachine };
