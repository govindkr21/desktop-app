// src/renderer/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import favicon from '../assets/favicon.png';

// Dynamically set favicon to match the Webpack compiled asset
const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
link.type = 'image/png';
link.rel = 'icon';
link.href = favicon;
document.getElementsByTagName('head')[0].appendChild(link);

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
