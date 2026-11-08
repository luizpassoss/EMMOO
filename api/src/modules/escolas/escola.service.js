import { ForbiddenError } from '../../shared/errors.js';
import { assertValid } from '../../shared/validation.js';
import { validarCadastroEscola } from './escola.validator.js';

/**
 * Cadastro de escolas (entrada de um novo "tenant"): cria a escola e quem vai coordená-la, e já devolve
 * a sessão. Pode ser fechado por configuração (CADASTRO_ESCOLAS=fechado), o padrão em produção.
 */
export function createEscolaService({ escolas, paraEscola, passwordHasher, auth, cadastroAberto, recuperacaoDeSenha = false }) {
  return {
    /** O que a tela de login oferece: cadastrar escola nova e "esqueci minha senha" (precisa do e-mail configurado). */
    configuracao() {
      return { cadastroDeEscolas: cadastroAberto, recuperacaoDeSenha };
    },

    async cadastrar(input) {
      if (!cadastroAberto) throw new ForbiddenError('O cadastro de novas escolas está desativado.');
      const { erros, dados } = validarCadastroEscola(input);
      assertValid(erros);
      const escola = await escolas.create(dados.escola); // 409 se o código já estiver em uso
      const { senha, ...responsavel } = dados.responsavel;
      const coordenacao = await paraEscola(escola.id).usuarios.create({
        ...responsavel,
        senhaHash: await passwordHasher.hash(senha),
        papel: 'coordenacao',
      });
      return auth.emitirSessao(coordenacao, escola);
    },
  };
}
