import { isDataISO, isHora } from '../../shared/datas.js';
import { toNumber } from '../../shared/validation.js';

/** RF07 — pedido de reposição: a aula perdida e o novo dia e horário. */
export function validarPedidoDeReposicao(input = {}) {
  const erros = [];
  const aulaId = toNumber(input.aulaId);
  if (!Number.isInteger(aulaId) || aulaId <= 0) erros.push({ campo: 'aulaId', mensagem: 'Escolha a aula a repor.' });
  if (!isDataISO(input.data)) erros.push({ campo: 'data', mensagem: 'Informe uma data válida.' });
  if (!isHora(input.hora)) erros.push({ campo: 'hora', mensagem: 'Escolha um horário livre.' });
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { aulaId, data: input.data, hora: input.hora } };
}
