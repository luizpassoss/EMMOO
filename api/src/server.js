import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import { iniciarRotinas } from './rotinas.js';

/** Encerra com uma mensagem que diz o que fazer, sem pilha de erro para quem só quer subir o app. */
function falhar(mensagem) {
  console.error(`\n✖ A API não iniciou.\n  ${mensagem}\n`);
  process.exit(1);
}

try {
  const env = loadEnv(process.env);
  const { repositories, auth, escolas, servicosDaEscola, tokenService } = await createContainer(env);
  const app = createApp({
    auth,
    escolas,
    servicosDaEscola,
    tokenService,
    corsOrigin: env.corsOrigin,
    trustProxy: env.trustProxy,
  });

  app
    .listen(env.port, () => {
      console.log(`API EMMOO ouvindo em http://localhost:${env.port} (persistência: ${env.dbDriver})`);
      // RF10/RF12 — mensalidades do mês e alertas de pagamento, ao iniciar e a cada hora.
      if (env.rotinas) iniciarRotinas({ escolas: repositories.escolas, servicosDaEscola });
    })
    .on('error', (erro) => {
      if (erro.code === 'EADDRINUSE') {
        falhar(`A porta ${env.port} já está em uso — a API provavelmente já está rodando em outro terminal.`);
      }
      falhar(erro.message);
    });
} catch (erro) {
  falhar(erro.message);
}
