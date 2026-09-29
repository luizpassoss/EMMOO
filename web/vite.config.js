import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Endereço da API em desenvolvimento (padrão: API local). Ex.: API_URL=http://localhost:3335 npm run dev
const API_URL = process.env.API_URL ?? 'http://localhost:3333';

/**
 * Se a API não estiver rodando, o proxy responderia um "500" sem explicação.
 * Em vez disso, devolve um 503 no formato de erro da API, com a instrução para resolver.
 */
function avisarApiDesligada(proxy) {
  proxy.on('error', (_erro, _req, res) => {
    if (res.headersSent || typeof res.writeHead !== 'function') return;
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          code: 'API_OFFLINE',
          message: `A API não está respondendo em ${API_URL}. Abra outro terminal, entre na pasta "api" e rode "npm run dev".`,
        },
      }),
    );
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, /api é encaminhado para a API local (evita CORS).
    proxy: { '/api': { target: API_URL, changeOrigin: true, configure: avisarApiDesligada } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/setupTests.js', 'src/**/*.test.{js,jsx}'],
      thresholds: { lines: 25, functions: 25, branches: 25, statements: 25 },
    },
  },
});
