/**
 * Feriados nacionais do Brasil num ano — para a escola não precisar cadastrá-los um a um.
 * Fixos por lei (Lei 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023) e móveis, calculados pela Páscoa:
 * a Sexta-feira Santa é feriado; Carnaval e Corpus Christi são pontos facultativos (a escola decide).
 */
import { somarDias } from '../shared/datas.js';

const dois = (numero) => String(numero).padStart(2, '0');

/** Domingo de Páscoa ("AAAA-MM-DD") pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

/**
 * @returns {{ inicio: string, fim: string, descricao: string, tipo: 'nacional' | 'facultativo' }[]} em ordem de data
 */
export function feriadosNacionais(ano) {
  const domingo = pascoa(ano);
  const dia = (mesDia) => `${ano}-${mesDia}`;
  const unico = (data, descricao, tipo = 'nacional') => ({ inicio: data, fim: data, descricao, tipo });
  const lista = [
    unico(dia('01-01'), 'Confraternização Universal'),
    { inicio: somarDias(domingo, -48), fim: somarDias(domingo, -47), descricao: 'Carnaval', tipo: 'facultativo' },
    unico(somarDias(domingo, -2), 'Sexta-feira Santa'),
    unico(dia('04-21'), 'Tiradentes'),
    unico(dia('05-01'), 'Dia do Trabalho'),
    unico(somarDias(domingo, 60), 'Corpus Christi', 'facultativo'),
    unico(dia('09-07'), 'Independência do Brasil'),
    unico(dia('10-12'), 'Nossa Senhora Aparecida'),
    unico(dia('11-02'), 'Finados'),
    unico(dia('11-15'), 'Proclamação da República'),
    // Feriado nacional desde 2024 (Lei 14.759/2023).
    ...(ano >= 2024 ? [unico(dia('11-20'), 'Dia Nacional de Zumbi e da Consciência Negra')] : []),
    unico(dia('12-25'), 'Natal'),
  ];
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
}
