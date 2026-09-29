const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const PAPEIS = { coordenacao: 'Coordenação', professor: 'Professor(a)', responsavel: 'Responsável' };
const TIPOS_PLANO = { particular: 'Particular', grupo: 'Grupo' };
const STATUS_AULA = { agendada: 'Agendada', realizada: 'Realizada', falta: 'Falta', cancelada: 'Cancelada' };

export function formatarMoeda(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? moeda.format(numero) : '—';
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
