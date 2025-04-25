import React from 'react';
import { createRoot } from 'react-dom/client';
import CookieMuncher from './CookieMuncher.tsx';
import './index.css'; // You'll need to create this CSS file.

const container = document.getElementById('root');
const root = createRoot(container); // Use createRoot

console.log("Hello from popup.js");

root.render(<CookieMuncher />);