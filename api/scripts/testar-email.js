/**
 * Confere o e-mail da API (alertas de pagamento e "esqueci minha senha"): faz login no servidor SMTP e manda uma
 * mensagem de teste. Em produção, dentro do contêiner:
 *
 *   docker compose exec app npm run email:testar -- --para alguem@exemplo.com
 *
 * Usa o SMTP_URL e o EMAIL_REMETENTE da API. Diz exatamente onde falhou: configuração, login ou envio.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env.js';
import { createMailer } from '../src/infra/email/mailer.js';

const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Verifica o login e envia o teste; devolve o que mostrar. */
export async function testarEmail(mailer, { para, remetente, escola = 'EMMOO', agora = new Date() }) {
  if (!PADRAO_EMAIL.test(para ?? '')) throw new Error('Informe para quem mandar o teste: --para alguem@exemplo.com');
  if (!mailer.configurado) throw new Error('SMTP_URL não está definido na API: o e-mail está desligado.');
  try {
    await mailer.verificar();
  } catch (erro) {
    throw new Error(`O servidor de e-mail recusou a conexão ou o login (${erro.message}). Confira o SMTP_URL e a senha.`);
  }
  await mailer.enviar({
    para,
    assunto: `Teste de e-mail — ${escola}`,
    texto: [
      'Olá.',
      '',
      `Este é um teste do e-mail do sistema da ${escola}, enviado em ${agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
      'Se chegou, os alertas de pagamento e o "Esqueci minha senha" estão funcionando.',
    ].join('\n'),
  });
  return `✔ Login no servidor de e-mail aceito e teste enviado para ${para} (remetente: ${remetente}).`;
}

async function principal(argv) {
  const { values } = parseArgs({ args: argv, options: { para: { type: 'string' } }, strict: true });
  const env = loadEnv({ ...process.env, ROTINAS: 'desligadas' });
  const mailer = createMailer({ smtpUrl: env.smtpUrl, remetente: env.emailRemetente });
  console.log(await testarEmail(mailer, { para: values.para, remetente: env.emailRemetente }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((erro) => {
      console.error(`✖ ${erro.message}`);
      process.exit(1);
    });
}
