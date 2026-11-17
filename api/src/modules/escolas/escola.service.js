import { criarLimitador, mensagemDeEspera } from '../../shared/limitador.js';
import { ForbiddenError, TooManyRequestsError } from '../../shared/errors.js';
import { assertValid } from '../../shared/validation.js';
import { codigoValido, MENSAGEM_CODIGO, normalizarCodigo, validarCadastroEscola } from './escola.validator.js';

const CADASTRO_FECHADO = 'O cadastro de novas escolas está desativado.';
export const CODIGO_EM_USO = 'Este código de escola já está em uso.';

/**
 * Limites por endereço (IP) nas rotas públicas: quem cadastra escola de verdade cadastra uma; a consulta do código
 * acompanha a digitação (com pausa), então aceita bem mais.
 */
export const LIMITES_DO_CADASTRO = {
  cadastroPorIp: { maximo: 5, janelaMs: 60 * 60 * 1000 },
  consultaPorIp: { maximo: 60, janelaMs: 15 * 60 * 1000 },
};

/**
 * Cadastro de escolas (entrada de um novo "tenant"): cria a escola e quem vai coordená-la, e já devolve
 * a sessão. Pode ser fechado por configuração (CADASTRO_ESCOLAS=fechado), o padrão em produção.
 */
export function createEscolaService({
  escolas,
  passwordHasher,
  auth,
  cadastroAberto,
  recuperacaoDeSenha = false,
  agora = () => Date.now(),
}) {
  const limite = Object.fromEntries(
    Object.entries(LIMITES_DO_CADASTRO).map(([nome, regra]) => [nome, criarLimitador({ ...regra, agora })]),
  );

  /** Conta a tentativa do endereço; passou do limite, recusa dizendo quanto esperar. Sem IP (testes), não limita. */
  function contar(limitador, ip) {
    if (!ip) return;
    const espera = limitador.esperaMs(ip);
    if (espera > 0) throw new TooManyRequestsError(mensagemDeEspera(espera));
    limitador.registrar(ip);
  }

  function garantirAberto() {
    if (!cadastroAberto) throw new ForbiddenError(CADASTRO_FECHADO);
  }

  return {
    /** O que a tela de login oferece: cadastrar escola nova e "esqueci minha senha" (precisa do e-mail configurado). */
    configuracao() {
      return { cadastroDeEscolas: cadastroAberto, recuperacaoDeSenha };
    },

    /**
     * O código pode ser usado? Responde enquanto a pessoa digita, antes de preencher o resto do cadastro.
     * Só com o cadastro aberto — fechado, não há o que consultar (e não se revela quais escolas existem).
     */
    async disponibilidade(input = {}, { ip } = {}) {
      garantirAberto();
      const codigo = normalizarCodigo(input.codigo);
      if (!codigoValido(codigo)) return { codigo, disponivel: false, mensagem: MENSAGEM_CODIGO };
      contar(limite.consultaPorIp, ip);
      return (await escolas.findByCodigo(codigo))
        ? { codigo, disponivel: false, mensagem: CODIGO_EM_USO }
        : { codigo, disponivel: true };
    },

    async cadastrar(input, { ip } = {}) {
      garantirAberto();
      const { erros, dados } = validarCadastroEscola(input);
      assertValid(erros);
      contar(limite.cadastroPorIp, ip); // só o que chega ao banco conta: dados inválidos não gastam tentativa
      const { senha, ...responsavel } = dados.responsavel;
      // A escola e a coordenação nascem juntas: se uma falhar, nenhuma fica (o código não fica preso sem dono).
      const { escola, coordenacao } = await escolas.criarComCoordenacao({
        escola: dados.escola,
        coordenacao: { ...responsavel, senhaHash: await passwordHasher.hash(senha), papel: 'coordenacao' },
      }); // 409 se o código já estiver em uso
      return auth.emitirSessao(coordenacao, escola);
    },
  };
}
