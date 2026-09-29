import { ValidationError } from '../../shared/errors.js';
import { toUsuarioPublico } from '../auth/auth.service.js';

export const PAPEIS = ['coordenacao', 'professor', 'responsavel'];

/** Consulta de usuários por papel — alimenta os seletores de professor e responsável. */
export function createUsuarioService({ usuarios }) {
  return {
    async listar({ papel } = {}) {
      if (papel !== undefined && !PAPEIS.includes(papel)) {
        throw new ValidationError([{ campo: 'papel', mensagem: 'Papel inválido.' }]);
      }
      return (await usuarios.list({ papel })).map(toUsuarioPublico);
    },
  };
}
