/**
 * Sobe a API e o front juntos, num só terminal (npm run dev na raiz).
 * Cada linha da saída ganha o prefixo [api] ou [web]; Ctrl+C encerra os dois.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SERVICOS = [
  { nome: 'api', cor: '\x1b[36m' },
  { nome: 'web', cor: '\x1b[35m' },
];
const RESET = '\x1b[0m';

const filhos = SERVICOS.map(({ nome, cor }) => {
  const filho = spawn('npm run dev', {
    cwd: fileURLToPath(new URL(`../${nome}/`, import.meta.url)),
    shell: true, // no Windows, "npm" é npm.cmd e só é encontrado via shell
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  for (const fluxo of [filho.stdout, filho.stderr]) {
    createInterface({ input: fluxo }).on('line', (linha) => console.log(`${cor}[${nome}]${RESET} ${linha}`));
  }
  filho.on('exit', (codigo) => {
    if (codigo) console.log(`${cor}[${nome}]${RESET} encerrou com código ${codigo}. Veja a mensagem acima.`);
  });
  return filho;
});

console.log('Subindo a API (http://localhost:3333) e o front (http://localhost:5173)... Ctrl+C encerra os dois.\n');

function encerrar() {
  for (const filho of filhos) filho.kill();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
