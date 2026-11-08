import { createHash, randomBytes } from 'node:crypto';
import { criarLimitador, mensagemDeEspera } from '../../shared/limitador.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors.js';
import { assertValid } from '../../shared/validation.js';
import { SENHA_MINIMA } from '../usuarios/usuario.validator.js';

/** Remove dados sensíveis (hash da senha) antes de devolver o usuário; com a escola, inclui nome e código dela. */
export function toUsuarioPublico(usuario, escola) {
  const publico = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    login: usuario.login ?? null,
    papel: usuario.papel,
    ativo: usuario.ativo !== false,
  };
  return escola ? { ...publico, escola: { id: escola.id, nome: escola.nome, codigo: escola.codigo } } : publico;
}

const versaoDaSessao = (usuario) => usuario.versaoSessao ?? 0;

const texto = (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : '');

const QUINZE_MINUTOS = 15 * 60 * 1000;
/** Limites de tentativas: senha errada por conta e por endereço (IP), pedidos de redefinição e trocas de senha. */
export const LIMITES = {
  loginPorConta: { maximo: 5, janelaMs: QUINZE_MINUTOS },
  loginPorIp: { maximo: 30, janelaMs: QUINZE_MINUTOS },
  esqueciPorConta: { maximo: 3, janelaMs: QUINZE_MINUTOS },
  esqueciPorIp: { maximo: 10, janelaMs: QUINZE_MINUTOS },
  redefinirPorIp: { maximo: 10, janelaMs: QUINZE_MINUTOS },
  senhaAtualPorUsuario: { maximo: 5, janelaMs: QUINZE_MINUTOS },
};
export const VALIDADE_DO_LINK_MS = 60 * 60 * 1000; // o link de redefinição vale 1 hora

/** O banco guarda só o hash do token: quem lê o banco não consegue usar um link ainda válido. */
const hashDoToken = (token) => createHash('sha256').update(token).digest('hex');
const PADRAO_TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url

export const MENSAGEM_ESQUECI =
  'Se a escola e o usuário estiverem certos, enviamos um link para o e-mail cadastrado. Ele vale por 1 hora.';
const LINK_INVALIDO = 'Este link de redefinição é inválido ou já expirou. Peça um novo em "Esqueci minha senha".';

/** Nova senha: mínimo de caracteres (a mesma regra do cadastro). */
function validarNovaSenha(valor, campo = 'novaSenha') {
  const senha = typeof valor === 'string' ? valor : '';
  return senha.length < SENHA_MINIMA
    ? [{ campo, mensagem: `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` }]
    : [];
}

/**
 * Caso de uso de autenticação (RF01), em várias escolas: a pessoa informa a escola (código) e,
 * dentro dela, o usuário ou o e-mail. O token carrega a escola, que define tudo o que ela pode ver.
 * Inclui a troca da própria senha e a redefinição por e-mail ("esqueci minha senha"), e limita as tentativas
 * (senha errada repetida bloqueia a conta e o endereço por alguns minutos — contra quem tenta adivinhar).
 */
export function createAuthService({
  escolas,
  paraEscola,
  passwordHasher,
  tokenService,
  redefinicoesDeSenha,
  mailer = { configurado: false },
  appUrl = 'http://localhost:5173',
  logger = console,
  agora = () => Date.now(),
}) {
  const limite = Object.fromEntries(
    Object.entries(LIMITES).map(([nome, regra]) => [nome, criarLimitador({ ...regra, agora })]),
  );

  /** Bloqueia se qualquer das chaves já passou do limite (diz quanto esperar). */
  function garantirLiberado(...pares) {
    const espera = Math.max(0, ...pares.map(([limitador, chave]) => (chave ? limitador.esperaMs(chave) : 0)));
    if (espera > 0) throw new TooManyRequestsError(mensagemDeEspera(espera));
  }
  const registrar = (...pares) => pares.forEach(([limitador, chave]) => chave && limitador.registrar(chave));

  /**
   * Sessão: token + usuário público (com a escola). Também usada ao cadastrar uma escola nova.
   * O token leva a versão da sessão do usuário: quando ela muda (ex.: acesso desativado), ele deixa de valer.
   */
  function emitirSessao(usuario, escola) {
    const token = tokenService.sign({
      sub: String(usuario.id),
      papel: usuario.papel,
      escola: escola.id,
      v: versaoDaSessao(usuario),
    });
    return { token, usuario: toUsuarioPublico(usuario, escola) };
  }

  /** A escola (pelo código) e a pessoa (por usuário ou e-mail) dentro dela; null se algum não existir. */
  async function encontrar(codigo, identificador) {
    const escola = codigo ? await escolas.findByCodigo(codigo) : null;
    if (!escola || !identificador) return { escola, usuario: null };
    const { usuarios } = paraEscola(escola.id);
    const usuario = identificador.includes('@')
      ? await usuarios.findByEmail(identificador)
      : await usuarios.findByLogin(identificador);
    return { escola, usuario };
  }

  /** Grava a senha nova e encerra as outras sessões (a versão sobe); os links de redefinição pendentes caem. */
  async function gravarSenha(usuario, escolaId, novaSenha) {
    const atualizado = await paraEscola(escolaId).usuarios.update(usuario.id, {
      senhaHash: await passwordHasher.hash(novaSenha),
      versaoSessao: versaoDaSessao(usuario) + 1,
    });
    await redefinicoesDeSenha?.invalidarDoUsuario(usuario.id, new Date(agora()).toISOString());
    return atualizado;
  }

  function mensagemDeRedefinicao(usuario, escola, token) {
    const link = `${appUrl.replace(/\/+$/, '')}/redefinir-senha?token=${token}`;
    return {
      para: usuario.email,
      assunto: `Redefinição de senha — ${escola.nome}`,
      texto: [
        `Olá, ${usuario.nome}.`,
        '',
        `Recebemos um pedido para redefinir a sua senha de acesso à ${escola.nome} (código da escola: ${escola.codigo}).`,
        'Para criar uma senha nova, abra o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez:',
        '',
        link,
        '',
        'Se não foi você quem pediu, ignore este e-mail: a sua senha continua a mesma.',
      ].join('\n'),
    };
  }

  return {
    emitirSessao,

    /**
     * Entra com usuário ("admin") ou e-mail. O campo "email" continua aceito por compatibilidade.
     * Depois de 5 senhas erradas na mesma conta (ou 30 no mesmo endereço) em 15 minutos, bloqueia por um tempo.
     */
    async login(input = {}, { ip } = {}) {
      const codigo = texto(input.escola);
      const identificador = texto(input.login ?? input.email);
      const senha = typeof input.senha === 'string' ? input.senha : '';
      const erros = [];
      if (!codigo) erros.push({ campo: 'escola', mensagem: 'Informe o código da escola.' });
      if (!identificador) erros.push({ campo: 'login', mensagem: 'Informe o usuário ou e-mail.' });
      if (!senha) erros.push({ campo: 'senha', mensagem: 'Informe a senha.' });
      assertValid(erros);

      const conta = `${codigo}|${identificador}`;
      garantirLiberado([limite.loginPorConta, conta], [limite.loginPorIp, ip]);
      const { escola, usuario } = await encontrar(codigo, identificador);
      const senhaConfere = usuario ? await passwordHasher.compare(senha, usuario.senhaHash) : false;
      // Mesma mensagem para escola, usuário ou senha errados: não revela quais escolas ou usuários existem.
      if (!senhaConfere) {
        registrar([limite.loginPorConta, conta], [limite.loginPorIp, ip]);
        throw new UnauthorizedError('Escola, usuário ou senha inválidos.');
      }
      limite.loginPorConta.limpar(conta);
      // Só depois da senha certa: quem sabe a senha pode saber que o acesso foi desativado.
      if (usuario.ativo === false) {
        throw new ForbiddenError('Seu acesso foi desativado. Entre em contato com a coordenação da escola.');
      }
      return emitirSessao(usuario, escola);
    },

    /**
     * Confere, a cada requisição, se a sessão do token ainda vale: o usuário existe na escola, está ativo e
     * a versão da sessão é a mesma. Devolve o usuário (com o perfil atual) ou null.
     */
    async validarSessao({ usuarioId, escolaId, versao = 0 }) {
      const usuario = await paraEscola(escolaId).usuarios.findById(usuarioId);
      if (!usuario || usuario.ativo === false || versaoDaSessao(usuario) !== versao) return null;
      return usuario;
    },

    async perfil(usuarioId, escolaId) {
      const escola = await escolas.findById(escolaId);
      const usuario = escola ? await paraEscola(escola.id).usuarios.findById(usuarioId) : null;
      if (!usuario) throw new NotFoundError('Usuário não encontrado.');
      return toUsuarioPublico(usuario, escola);
    },

    /**
     * Troca da própria senha, com a senha atual. As outras sessões abertas (outro celular, outro computador)
     * são encerradas; esta continua, com o token novo que volta na resposta.
     */
    async trocarSenha({ id, escolaId }, input = {}) {
      const escola = await escolas.findById(escolaId);
      const usuario = escola ? await paraEscola(escola.id).usuarios.findById(id) : null;
      if (!usuario) throw new NotFoundError('Usuário não encontrado.');
      const senhaAtual = typeof input.senhaAtual === 'string' ? input.senhaAtual : '';
      const erros = [
        ...(senhaAtual ? [] : [{ campo: 'senhaAtual', mensagem: 'Informe a senha atual.' }]),
        ...validarNovaSenha(input.novaSenha),
      ];
      assertValid(erros);
      const chave = `${escola.id}|${usuario.id}`;
      garantirLiberado([limite.senhaAtualPorUsuario, chave]);
      if (!(await passwordHasher.compare(senhaAtual, usuario.senhaHash))) {
        registrar([limite.senhaAtualPorUsuario, chave]);
        throw new ValidationError([{ campo: 'senhaAtual', mensagem: 'A senha atual não confere.' }]);
      }
      if (input.novaSenha === senhaAtual) {
        throw new ValidationError([{ campo: 'novaSenha', mensagem: 'A nova senha precisa ser diferente da atual.' }]);
      }
      limite.senhaAtualPorUsuario.limpar(chave);
      return emitirSessao(await gravarSenha(usuario, escola.id, input.novaSenha), escola);
    },

    /**
     * "Esqueci minha senha": com a escola e o usuário (ou e-mail), manda um link de redefinição ao e-mail
     * cadastrado. A resposta é sempre a mesma — não revela se a pessoa existe — e o envio do e-mail (a parte
     * demorada) segue em segundo plano, sem pesar no tempo de resposta. Sem e-mail configurado na API, a
     * coordenação redefine.
     */
    async esqueciSenha(input = {}, { ip } = {}) {
      if (!mailer.configurado || !redefinicoesDeSenha) {
        throw new ConflictError(
          'A recuperação por e-mail não está disponível. Peça à coordenação da escola para redefinir a sua senha.',
        );
      }
      const codigo = texto(input.escola);
      const identificador = texto(input.login ?? input.email);
      const erros = [];
      if (!codigo) erros.push({ campo: 'escola', mensagem: 'Informe o código da escola.' });
      if (!identificador) erros.push({ campo: 'login', mensagem: 'Informe o usuário ou e-mail.' });
      assertValid(erros);

      const conta = `${codigo}|${identificador}`;
      garantirLiberado([limite.esqueciPorConta, conta], [limite.esqueciPorIp, ip]);
      registrar([limite.esqueciPorConta, conta], [limite.esqueciPorIp, ip]);

      const { escola, usuario } = await encontrar(codigo, identificador);
      if (escola && usuario && usuario.ativo !== false && usuario.email) {
        const instante = agora();
        const token = randomBytes(32).toString('base64url');
        await redefinicoesDeSenha.removerVencidos(new Date(instante).toISOString());
        await redefinicoesDeSenha.invalidarDoUsuario(usuario.id, new Date(instante).toISOString()); // só o último link vale
        await redefinicoesDeSenha.create({
          escolaId: escola.id,
          usuarioId: usuario.id,
          tokenHash: hashDoToken(token),
          expiraEm: new Date(instante + VALIDADE_DO_LINK_MS).toISOString(),
        });
        mailer.enviar(mensagemDeRedefinicao(usuario, escola, token)).catch((erro) => {
          logger.error?.(`[senha] não foi possível enviar o e-mail de redefinição: ${erro?.message ?? erro}`);
        });
      }
      return { mensagem: MENSAGEM_ESQUECI };
    },

    /**
     * Cria a senha nova a partir do link do e-mail: o token precisa existir, não ter sido usado e estar no prazo.
     * Todas as sessões abertas da pessoa são encerradas; ela entra de novo com a senha nova.
     */
    async redefinirSenha(input = {}, { ip } = {}) {
      garantirLiberado([limite.redefinirPorIp, ip]);
      const token = typeof input.token === 'string' ? input.token.trim() : '';
      assertValid(validarNovaSenha(input.novaSenha));
      const invalido = () => {
        registrar([limite.redefinirPorIp, ip]);
        return new ValidationError([{ campo: 'token', mensagem: LINK_INVALIDO }], LINK_INVALIDO);
      };
      if (!PADRAO_TOKEN.test(token) || !redefinicoesDeSenha) throw invalido();
      const pedido = await redefinicoesDeSenha.findByTokenHash(hashDoToken(token));
      const instante = new Date(agora()).toISOString();
      if (!pedido || pedido.usadoEm || pedido.expiraEm <= instante) throw invalido();
      const [escola, usuario] = await Promise.all([
        escolas.findById(pedido.escolaId),
        paraEscola(pedido.escolaId).usuarios.findById(pedido.usuarioId),
      ]);
      if (!escola || !usuario || usuario.ativo === false) throw invalido();
      if (!(await redefinicoesDeSenha.usar(pedido.id, instante))) throw invalido(); // o mesmo link, duas vezes
      await gravarSenha(usuario, escola.id, input.novaSenha);
      return { mensagem: 'Senha redefinida. Entre com a senha nova.', escola: escola.codigo };
    },
  };
}
