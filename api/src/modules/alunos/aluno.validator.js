import { isNonEmptyString, isVazio, toNumber } from '../../shared/validation.js';

export const STATUS_ALUNO = ['ativo', 'inativo'];

/** Valida os dados de um aluno (RF02) e devolve os dados normalizados. */
export function validarAluno(input = {}) {
  const erros = [];
  if (!isNonEmptyString(input.nome, 2)) {
    erros.push({ campo: 'nome', mensagem: 'Informe o nome do aluno (mínimo 2 caracteres).' });
  }
  if (!isNonEmptyString(input.contato, 8)) {
    erros.push({ campo: 'contato', mensagem: 'Informe um contato válido (telefone ou e-mail).' });
  }
  if (!isNonEmptyString(input.instrumento, 2)) {
    erros.push({ campo: 'instrumento', mensagem: 'Informe o instrumento.' });
  }
  const planoId = toNumber(input.planoId);
  if (!Number.isInteger(planoId) || planoId <= 0) {
    erros.push({ campo: 'planoId', mensagem: 'Selecione um plano válido.' });
  }
  let usuarioRespId = null;
  if (!isVazio(input.usuarioRespId)) {
    usuarioRespId = toNumber(input.usuarioRespId);
    if (!Number.isInteger(usuarioRespId) || usuarioRespId <= 0) {
      erros.push({ campo: 'usuarioRespId', mensagem: 'Responsável inválido.' });
    }
  }

  if (erros.length > 0) return { erros, dados: null };
  return {
    erros,
    dados: {
      nome: input.nome.trim(),
      contato: input.contato.trim(),
      instrumento: input.instrumento.trim(),
      planoId,
      usuarioRespId,
    },
  };
}
