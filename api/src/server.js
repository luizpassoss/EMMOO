import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';

/** Encerra com uma mensagem que diz o que fazer, sem pilha de erro para quem só quer subir o app. */
function falhar(mensagem) {
  console.error(`\n✖ A API não iniciou.\n  ${mensagem}\n`);
  process.exit(1);
}

try {
  const env = loadEnv(process.env);
  const { services, tokenService } = await createContainer(env);
  const app = createApp({ services, tokenService, corsOrigin: env.corsOrigin });

  app
    .listen(env.port, () => {
      console.log(`API EMMOO ouvindo em http://localhost:${env.port} (persistência: ${env.dbDriver})`);
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
