import { app } from './App.js';

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

window.addEventListener('beforeunload', () => {
  app.destroy();
});
