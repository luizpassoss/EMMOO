import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId } from '../../shared/validation.js';
import { toUsuarioPublico } from '../auth/auth.service.js';
import { criarAplicadorDeGrade } from '../horarios/horario.service.js';
import { validarGrade } from '../horarios/horario.validator.js';
import { PAPEIS, validarUsuario } from './usuario.validator.js';

export { PAPEIS };

/**
 * Usuários da escola: consulta por papel (seletores) e cadastro/edição pela coordenação.
 * Professor novo pode já vir com a grade de atendimento (`horarios`): os horários são criados junto com o acesso,
 * e o agendamento passa a sugerir os horários livres dele desde o primeiro dia (RF04/RF05).
 */
export function createUsuarioService({ usuarios, passwordHasher, horarios }) {
  const aplicarGrade = horarios ? criarAplicadorDeGrade(horarios) : null;
  async function buscar(id) {
    const usuario = await usuarios.findById(parseId(id));
    if (!usuario) throw new NotFoundError('Usuário não encontrado.');
    return usuario;
  }

  /** Nova versão de sessão: os tokens já emitidos para a pessoa deixam de valer (ela entra de novo). */
  const encerrarSessoes = (usuario) => ({ versaoSessao: (usuario.versaoSessao ?? 0) + 1 });

  return {
    async listar({ papel } = {}) {
      if (papel !== undefined && !PAPEIS.includes(papel)) {
        throw new ValidationError([{ campo: 'papel', mensagem: 'Perfil inválido.' }]);
      }
      return (await usuarios.list({ papel })).map((usuario) => toUsuarioPublico(usuario));
    },

    async criar(input = {}) {
      const { erros, dados } = validarUsuario(input, { exigirSenha: true });
      // A grade é validada antes de criar o acesso: nada é gravado se ela estiver errada.
      const grade = input.papel === 'professor' && input.horarios && aplicarGrade ? validarGrade(input.horarios) : null;
      assertValid([...erros, ...(grade?.erros ?? []).map((erro) => ({ ...erro, campo: `horarios.${erro.campo}` }))]);
      const { senha, ...resto } = dados;
      const criado = await usuarios.create({ ...resto, senhaHash: await passwordHasher.hash(senha) });
      const horariosCriados = grade ? (await aplicarGrade(criado.id, grade.dados.horarios)).criados : 0;
      return { ...toUsuarioPublico(criado), horariosCriados };
    },

    /**
     * Edita dados e perfil; senha em branco mantém a atual. Ninguém muda o próprio perfil (evita a escola ficar
     * sem coordenação). Perfil trocado ou senha redefinida de outra pessoa encerram as sessões abertas dela.
     */
    async atualizar(id, input, usuarioLogado) {
      const atual = await buscar(id);
      const { erros, dados } = validarUsuario(input, { exigirSenha: false });
      assertValid(erros);
      const eMesmo = atual.id === usuarioLogado?.id;
      if (eMesmo && dados.papel !== atual.papel) {
        throw new ValidationError([{ campo: 'papel', mensagem: 'Você não pode mudar o seu próprio perfil.' }]);
      }
      const { senha, ...resto } = dados;
      const alteracoes = {
        ...resto,
        ...(senha && { senhaHash: await passwordHasher.hash(senha) }),
        ...(!eMesmo && (dados.papel !== atual.papel || senha) && encerrarSessoes(atual)),
      };
      return toUsuarioPublico(await usuarios.update(atual.id, alteracoes));
    },

    /** Tira o acesso: a pessoa não entra mais e a sessão aberta dela termina na próxima ação. */
    async desativar(id, usuarioLogado) {
      const atual = await buscar(id);
      if (atual.id === usuarioLogado?.id) throw new ConflictError('Você não pode desativar o seu próprio acesso.');
      if (atual.ativo === false) throw new ConflictError('Este acesso já está desativado.');
      return toUsuarioPublico(await usuarios.update(atual.id, { ativo: false, ...encerrarSessoes(atual) }));
    },

    async reativar(id) {
      const atual = await buscar(id);
      if (atual.ativo !== false) throw new ConflictError('Este acesso já está ativo.');
      return toUsuarioPublico(await usuarios.update(atual.id, { ativo: true }));
    },
  };
}
