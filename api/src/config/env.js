export const DEV_JWT_SECRET = 'dev-secret-altere-em-producao';
/** Segredos que aparecem no repositório (código, .env.example, docker-compose): públicos, nunca valem em produção. */
const SEGREDOS_DE_EXEMPLO = [DEV_JWT_SECRET, 'troque-este-segredo-em-producao'];
export const SEGREDO_MINIMO = 32;
const COMO_GERAR = `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
const DRIVERS = ['memory', 'mysql'];

/**
 * Lê e valida as variáveis de ambiente, aplicando padrões seguros para desenvolvimento.
 * Falha cedo (na inicialização) quando a configuração é inválida.
 */
export function loadEnv(source = process.env) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const dbDriver = (source.DB_DRIVER ?? 'memory').toLowerCase();
  if (!DRIVERS.includes(dbDriver)) {
    throw new Error(`DB_DRIVER inválido: "${dbDriver}". Use "memory" ou "mysql".`);
  }
  if (dbDriver === 'mysql' && !source.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatória quando DB_DRIVER=mysql.');
  }

  const port = Number(source.PORT ?? 3333);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT inválida: "${source.PORT}".`);
  }

  // Quem conhece o segredo monta um token de qualquer pessoa. Em produção: próprio, longo e fora do repositório.
  // Em desenvolvimento, o de exemplo funciona, mas a API avisa ao iniciar (ex.: antes de abrir um túnel como o ngrok).
  const avisos = [];
  const jwtSecret = source.JWT_SECRET || DEV_JWT_SECRET;
  const segredoDeExemplo = SEGREDOS_DE_EXEMPLO.includes(jwtSecret);
  if (nodeEnv === 'production' && (segredoDeExemplo || jwtSecret.length < SEGREDO_MINIMO)) {
    throw new Error(
      `Defina um JWT_SECRET próprio em produção, com pelo menos ${SEGREDO_MINIMO} caracteres aleatórios. Para gerar: ${COMO_GERAR}`,
    );
  }
  if (segredoDeExemplo && nodeEnv !== 'test') {
    avisos.push(
      `JWT_SECRET é o de exemplo, que é público: não exponha esta API na internet. Para gerar um próprio: ${COMO_GERAR}`,
    );
  }

  // Cadastro público de escolas novas: aberto em desenvolvimento, fechado em produção (salvo se liberado).
  const cadastroEscolas = (source.CADASTRO_ESCOLAS ?? (nodeEnv === 'production' ? 'fechado' : 'aberto')).toLowerCase();
  if (!['aberto', 'fechado'].includes(cadastroEscolas)) {
    throw new Error(`CADASTRO_ESCOLAS inválido: "${cadastroEscolas}". Use "aberto" ou "fechado".`);
  }

  // Rotinas automáticas (mensalidades do mês e alertas, a cada hora): ligadas, salvo nos testes.
  const rotinas = (source.ROTINAS ?? (nodeEnv === 'test' ? 'desligadas' : 'ligadas')).toLowerCase();
  if (!['ligadas', 'desligadas'].includes(rotinas)) {
    throw new Error(`ROTINAS inválido: "${rotinas}". Use "ligadas" ou "desligadas".`);
  }

  const corsOrigin = (source.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

  // Endereço do front, para os links enviados por e-mail (redefinição de senha). Padrão: a primeira origem do CORS.
  const ENDERECO = /^https?:\/\/[^\s/]+/i;
  if (source.APP_URL && !ENDERECO.test(source.APP_URL)) {
    throw new Error(`APP_URL inválida: "${source.APP_URL}". Use o endereço do front, ex.: https://emmoo.escola.com.br`);
  }
  // Em produção, sem ela os links dos e-mails apontariam para localhost (e o HTTPS não seria exigido do navegador).
  if (nodeEnv === 'production' && !source.APP_URL) {
    throw new Error('Defina APP_URL em produção: o endereço público do sistema, ex.: https://emmoo.escola.com.br');
  }
  const appUrl = (source.APP_URL || corsOrigin.find((origem) => ENDERECO.test(origem)) || 'http://localhost:5173').replace(
    /\/+$/,
    '',
  );

  return {
    nodeEnv,
    port,
    dbDriver,
    databaseUrl: source.DATABASE_URL ?? null,
    jwtSecret,
    jwtExpiresIn: source.JWT_EXPIRES_IN ?? '8h',
    cadastroEscolas: cadastroEscolas === 'aberto',
    rotinas: rotinas === 'ligadas',
    // RF12 — e-mail dos alertas de pagamento (opcional): sem SMTP_URL, os alertas ficam pendentes para reenvio.
    smtpUrl: source.SMTP_URL || null,
    emailRemetente: source.EMAIL_REMETENTE || 'EMMOO <nao-responda@emmoo.app>',
    corsOrigin,
    appUrl,
    trustProxy: lerTrustProxy(source.TRUST_PROXY),
    // Produção num serviço só: a API entrega também o front construído (a imagem Docker o põe em /app/public).
    pastaDoFront: source.FRONT_DIR || null,
    avisos, // o que funciona, mas não deveria ir assim para a internet (mostrado ao iniciar)
  };
}

/**
 * TRUST_PROXY — a API está atrás de um proxy (nginx, túnel)? Assim o endereço (IP) de quem acessa, usado no
 * limite de tentativas de login, vem do cabeçalho X-Forwarded-For. Sem a variável: não confia (acesso direto).
 * Aceita "true"/"false", o número de proxies na frente (ex.: 1) ou a lista do Express (ex.: "loopback").
 */
function lerTrustProxy(valor) {
  const texto = String(valor ?? '').trim().toLowerCase();
  if (texto === '' || texto === 'false') return false;
  if (texto === 'true') return true;
  if (/^\d+$/.test(texto)) return Number(texto);
  if (/^[a-z0-9.:/,\s-]+$/.test(texto)) return texto;
  throw new Error(`TRUST_PROXY inválido: "${valor}". Use true, false, o número de proxies (ex.: 1) ou "loopback".`);
}
