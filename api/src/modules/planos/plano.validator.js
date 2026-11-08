import { isNonEmptyString, toNumber } from '../../shared/validation.js';

export const TIPOS_PLANO = ['particular', 'grupo'];
export const DURACAO_PADRAO_MIN = 45;

/** Valida os dados de um plano (RF03) e devolve os dados normalizados. */
export function validarPlano(input = {}) {
  const erros = [];
  if (!isNonEmptyString(input.nome, 2)) {
    erros.push({ campo: 'nome', mensagem: 'Informe o nome do plano (mínimo 2 caracteres).' });
  }
  if (!TIPOS_PLANO.includes(input.tipo)) {
    erros.push({ campo: 'tipo', mensagem: 'Escolha o tipo do plano: particular ou em grupo.' });
  }
  const valor = toNumber(input.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    erros.push({ campo: 'valor', mensagem: 'O valor deve ser um número maior que zero.' });
  }
  const freqSemanal = toNumber(input.freqSemanal);
  if (!Number.isInteger(freqSemanal) || freqSemanal < 1 || freqSemanal > 7) {
    erros.push({ campo: 'freqSemanal', mensagem: 'Escolha de 1 a 7 aulas por semana.' });
  }
  const duracaoMin = input.duracaoMin === undefined ? DURACAO_PADRAO_MIN : toNumber(input.duracaoMin);
  if (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração da aula deve ficar entre 15 e 240 minutos.' });
  }

  if (erros.length > 0) return { erros, dados: null };
  return {
    erros,
    dados: {
      nome: input.nome.trim(),
      tipo: input.tipo,
      valor: Math.round(valor * 100) / 100,
      freqSemanal,
      duracaoMin,
    },
  };
}
