/**
 * Planilha CSV no formato que o Excel em português abre direto: separador ";", vírgula nos decimais, datas
 * dd/mm/aaaa e a marca BOM no início (para os acentos saírem certos). Cada célula vai entre aspas quando
 * precisa; texto que começa com =, +, - ou @ ganha um apóstrofo na frente, para o Excel não executá-lo
 * como fórmula (injeção de fórmula em CSV).
 */
const BOM = '\uFEFF';
const FORMULA = /^[=+\-@\t\r]/;

/** Célula de texto (números e datas já vêm formatados como texto). */
function celula(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (FORMULA.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** 1234.5 → "1234,50" (sem separador de milhar: a planilha soma sem tropeçar). */
export function numeroCsv(valor, casas = 2) {
  return Number(valor).toFixed(casas).replace('.', ',');
}

/** "2026-10-05" → "05/10/2026"; vazio → "". */
export function dataCsv(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Monta o arquivo: cabeçalho e linhas (listas de valores), com quebra de linha do Windows. */
export function gerarCsv(cabecalho, linhas) {
  return BOM + [cabecalho, ...linhas].map((linha) => linha.map(celula).join(';')).join('\r\n') + '\r\n';
}
