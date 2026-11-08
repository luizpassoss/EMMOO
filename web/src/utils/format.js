const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaSemCentavos = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PAPEIS = { coordenacao: 'Coordenação', professor: 'Professor(a)', responsavel: 'Responsável' };
const TIPOS_PLANO = { particular: 'Particular', grupo: 'Grupo' };
const STATUS_AULA = { agendada: 'Agendada', realizada: 'Realizada', falta: 'Falta', cancelada: 'Cancelada' };
const STATUS_MENSALIDADE = { pendente: 'Pendente', atrasada: 'Atrasada', paga: 'Paga', cancelada: 'Cancelada' };

/** RF11 — formas de pagamento aceitas pela escola na baixa (as mesmas da API): Pix ou dinheiro. */
export const FORMAS_PAGAMENTO = [
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
];

export function rotuloStatusMensalidade(status) {
  return STATUS_MENSALIDADE[status] ?? status ?? '';
}

/** Percentual para os indicadores: 83 → "83%"; sem registro (null) → "—". */
export function formatarPercentual(valor) {
  return valor === null || valor === undefined ? '—' : `${valor}%`;
}

export function formatarMoeda(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? moeda.format(numero) : '—';
}

/** Para listas: "R$ 140" quando o valor é redondo, "R$ 140,50" quando tem centavos. */
export function formatarMoedaCurta(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return Number.isInteger(numero) ? moedaSemCentavos.format(numero) : moeda.format(numero);
}

export function rotuloPapel(papel) {
  return PAPEIS[papel] ?? papel ?? '';
}

export function rotuloTipoPlano(tipo) {
  return TIPOS_PLANO[tipo] ?? tipo ?? '';
}

export function rotuloStatusAula(status) {
  return STATUS_AULA[status] ?? status ?? '';
}

/** "1 aula" / "3 aulas". */
export function plural(quantidade, singular, pluralTexto = `${singular}s`) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

/** Frequência por extenso: 1 → "1 aula por semana", 2 → "2 aulas por semana" (nada de "1x/semana"). */
export function rotuloFrequencia(freqSemanal) {
  return `${plural(Number(freqSemanal), 'aula', 'aulas')} por semana`;
}

/** Nome sugerido para o plano: "Particular · 1 aula por semana", "Grupo · 3 aulas por semana". */
export function nomeSugeridoPlano({ tipo, freqSemanal }) {
  return `${rotuloTipoPlano(tipo)} · ${rotuloFrequencia(freqSemanal)}`;
}

/**
 * Telefone brasileiro digitado só com números (ou já com parênteses e traço) vira "(47) 99999-0001" ou
 * "(47) 3333-0001"; com o 55 do país na frente, ele sai. E-mail, texto livre ou número incompleto ficam como estão.
 */
export function formatarContato(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^[\d\s()+.-]+$/.test(texto)) return texto;
  let digitos = texto.replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return texto;
}

/**
 * Endereço para tocar no contato e ligar ou escrever: telefone brasileiro → "tel:+5547999990001";
 * e-mail → "mailto:…". Texto livre ou número incompleto → null (fica só o texto).
 */
export function linkDoContato(valor) {
  const texto = String(valor ?? '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return `mailto:${texto}`;
  if (!/^[\d\s()+.-]+$/.test(texto)) return null;
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return `tel:+55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return `tel:+${digitos}`;
  return null;
}

/** O formulário mudou em relação ao que foi carregado? Compara campo a campo, como texto. */
export function foiAlterado(atual, inicial) {
  const chaves = new Set([...Object.keys(atual ?? {}), ...Object.keys(inicial ?? {})]);
  return [...chaves].some((chave) => String(atual?.[chave] ?? '') !== String(inicial?.[chave] ?? ''));
}

/** Até duas iniciais do nome, para o avatar. */
export function iniciais(nome) {
  return String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}
