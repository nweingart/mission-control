import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'agent-native/styles';
import './index.css';

// Always apply dark mode (inline script in index.html is blocked by production CSP)
document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
