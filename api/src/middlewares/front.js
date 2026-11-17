import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

const UM_ANO = 'public, max-age=31536000, immutable';

/**
 * Em produção, a própria API entrega o front já construído (`web/dist`), na mesma origem: um serviço só para
 * hospedar, sem CORS e sem outro servidor na frente. Os arquivos de `assets/` têm o hash no nome e ficam em
 * cache por um ano; o index.html e o manifesto, nunca (uma versão nova aparece no próximo acesso). As rotas do
 * React (/agenda, /alunos/3...) recebem o index.html; /api e arquivos que não existem seguem para o 404 em JSON.
 */
export function servirFront(pasta) {
  const raiz = path.resolve(pasta);
  const indice = path.join(raiz, 'index.html');
  if (!existsSync(indice)) {
    throw new Error(`FRONT_DIR não tem o front construído (index.html) em "${raiz}". Na pasta "web", rode: npm run build`);
  }

  const router = express.Router();
  router.use(
    express.static(raiz, {
      index: false,
      setHeaders(res, arquivo) {
        const relativo = path.relative(raiz, arquivo).split(path.sep);
        if (relativo[0] === 'assets') res.setHeader('Cache-Control', UM_ANO);
        else if (/\.(html|webmanifest)$/.test(arquivo)) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400'); // ícones e favicon
      },
    }),
  );
  router.get('*', (req, res, next) => {
    const daApi = req.path === '/api' || req.path.startsWith('/api/');
    // Com extensão (ex.: /assets/velho.js de uma versão anterior), é arquivo que não existe — não a página.
    if (daApi || path.extname(req.path) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indice);
  });
  return router;
}
