import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fontes variáveis empacotadas com o app (sem depender de CDN): o mesmo desenho em qualquer aparelho.
// Plus Jakarta Sans nos títulos, números e botões; Inter no texto corrido e nos campos.
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
