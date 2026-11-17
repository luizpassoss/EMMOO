/**
 * Cria uma escola e o acesso de quem a coordena direto no banco — o jeito de começar em produção, onde o cadastro
 * público fica fechado e o seed (com usuários de demonstração e senhas públicas) não deve rodar.
 *
 *   npm run escola:criar -- --nome "Escola de Música EMMOO" --codigo emmoo --responsavel "Lucimara" \
 *     --email lucimara@escola.com.br [--login admin] [--senha "..."]
 *
 * Sem --senha, gera uma senha aleatória e a mostra uma vez: a pessoa troca no primeiro acesso, em Minha conta.
 * Usa as mesmas regras do cadastro pela tela (código, e-mail, tamanho da senha) e grava escola e coordenação juntas.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env.js';
import { createContainer } from '../src/container.js';

const OPCOES = {
  nome: { type: 'string' },
  codigo: { type: 'string' },
  responsavel: { type: 'string' },
  email: { type: 'string' },
  login: { type: 'string' },
  senha: { type: 'string' },
};

export const gerarSenha = () => randomBytes(10).toString('base64url'); // 14 caracteres

/** Cria a escola pelo serviço de cadastro; devolve o que mostrar (a senha só quando foi gerada aqui). */
export async function criarEscola(escolas, valores, { senhaAleatoria = gerarSenha } = {}) {
  const senhaGerada = valores.senha ? null : senhaAleatoria();
  const { usuario } = await escolas.cadastrar({
    nomeEscola: valores.nome,
    codigo: valores.codigo,
    nome: valores.responsavel,
    email: valores.email,
    login: valores.login ?? '',
    senha: valores.senha ?? senhaGerada,
  });
  return { escola: usuario.escola, usuario, senhaGerada };
}

async function principal(argv) {
  const { values } = parseArgs({ args: argv, options: OPCOES, strict: true });
  // Este comando existe para o banco de verdade: o cadastro fica aberto só para ele, e as rotinas não rodam.
  const env = loadEnv({ ...process.env, CADASTRO_ESCOLAS: 'aberto', ROTINAS: 'desligadas' });
  if (env.dbDriver !== 'mysql') {
    throw new Error('Este comando grava no MySQL: defina DB_DRIVER=mysql e DATABASE_URL (no modo memória, nada fica salvo).');
  }
  const { escolas } = await createContainer(env);
  const { escola, usuario, senhaGerada } = await criarEscola(escolas, values);
  console.log(`\n✔ Escola "${escola.nome}" criada. Código de acesso: ${escola.codigo}`);
  console.log(`  Coordenação: ${usuario.nome} — entra com ${usuario.login ?? usuario.email}`);
  if (senhaGerada) console.log(`  Senha provisória: ${senhaGerada}  (mostrada só agora: troque no primeiro acesso, em Minha conta)`);
  console.log(`  Link de acesso: ${env.appUrl}/login?escola=${escola.codigo}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((erro) => {
      const detalhes = erro.details?.map((detalhe) => `\n  - ${detalhe.mensagem}`).join('') ?? '';
      console.error(`\n✖ A escola não foi criada. ${erro.message}${detalhes}\n`);
      process.exit(1);
    });
}
