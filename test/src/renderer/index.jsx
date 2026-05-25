// src/renderer/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log('Renderer process started, DOM state:', document.readyState);

function render() {
  const container = document.getElementById('root');
  if (container) {
    console.log('Root container found, rendering App...');
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('CRITICAL: Root container not found!');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
