import { describe, expect, it } from 'vitest';
import {
  aulaJaTerminou,
  dataPorExtenso,
  diaDaSemana,
  diasDaSemana,
  diferencaEmDias,
  formatarData,
  formatarDataCompleta,
  formatarMomento,
  horaAtual,
  hojeISO,
  horaFim,
  inicioDaJanela,
  mesDaData,
  nomeDoMes,
  rotuloDia,
  rotuloDiaRelativo,
  rotuloPeriodo,
  somarDias,
  somarMeses,
} from './datas.js';

describe('meses de referência e datas completas', () => {
  it('mês "AAAA-MM": da data, somado e por extenso', () => {
    expect(mesDaData('2026-10-17')).toBe('2026-10');
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(nomeDoMes('2026-03')).toBe('março de 2026');
    expect(nomeDoMes('2026-10', { maiuscula: true })).toBe('Outubro de 2026');
  });
  it('data com ano e instante da API no fuso do navegador', () => {
    expect(formatarDataCompleta('2026-10-05')).toBe('05/10/2026');
    const instante = new Date(2026, 9, 7, 8, 5).toISOString(); // 07/10, 08:05 no fuso local
    expect(formatarMomento(instante)).toBe('07/10 às 08:05');
  });
});

describe('datas', () => {
  it('usa a data e a hora locais de agora', () => {
    expect(hojeISO(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09');
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(horaAtual(new Date(2026, 0, 9, 7, 5))).toBe('07:05');
    expect(horaAtual()).toMatch(/^\d{2}:\d{2}$/);
  });
  it('soma dias atravessando meses e anos', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('janela de 7 dias a partir de uma data', () => {
    expect(diaDaSemana('2026-10-04')).toBe(0);
    expect(diasDaSemana('2026-10-15')).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
    expect(diferencaEmDias('2026-10-15', '2026-11-02')).toBe(18);
    expect(diferencaEmDias('2026-10-15', '2026-10-12')).toBe(-3);
  });
  it('a agenda anda em janelas de 7 dias a partir de hoje, nunca antes', () => {
    const hoje = '2026-10-15'; // quinta
    expect(inicioDaJanela('2026-10-15', hoje)).toBe('2026-10-15');
    expect(inicioDaJanela('2026-10-21', hoje)).toBe('2026-10-15'); // ainda a primeira janela
    expect(inicioDaJanela('2026-10-22', hoje)).toBe('2026-10-22');
    expect(inicioDaJanela('2026-11-02', hoje)).toBe('2026-10-29');
    expect(inicioDaJanela('2026-10-01', hoje)).toBe('2026-10-15'); // passado: a janela de hoje
    expect(inicioDaJanela(hojeISO())).toBe(hojeISO());
  });
  it('aula já terminou: dia anterior ou hoje depois do término; em andamento, não', () => {
    const aula = { data: '2026-10-15', hora: '14:00', duracaoMin: 45 };
    expect(aulaJaTerminou(aula, '2026-10-15', '13:59')).toBe(false);
    expect(aulaJaTerminou(aula, '2026-10-15', '14:30')).toBe(false); // em andamento
    expect(aulaJaTerminou(aula, '2026-10-15', '14:45')).toBe(true);
    expect(aulaJaTerminou(aula, '2026-10-16', '08:00')).toBe(true);
    expect(aulaJaTerminou(aula, '2026-10-14', '23:00')).toBe(false);
    expect(aulaJaTerminou({ data: '2000-01-03', hora: '10:00', duracaoMin: 45 })).toBe(true);
  });
  it('formata o dia em português', () => {
    expect(formatarData('2026-10-05')).toBe('05/10');
    expect(rotuloDia('2026-10-05')).toBe('Segunda, 05/10');
  });
  it('escreve períodos de feriado sem repetir mês e ano', () => {
    expect(rotuloPeriodo('2026-11-02', '2026-11-02')).toBe('2 nov 2026');
    expect(rotuloPeriodo('2032-03-08', '2032-03-09')).toBe('8 – 9 mar 2032');
    expect(rotuloPeriodo('2026-07-27', '2026-08-07')).toBe('27 jul – 7 ago 2026');
    expect(rotuloPeriodo('2026-12-21', '2027-01-08')).toBe('21 dez 2026 – 8 jan 2027');
    expect(rotuloPeriodo('2026-03-10', '2027-03-12')).toBe('10 mar 2026 – 12 mar 2027'); // mesmo mês, outro ano
  });
  it('escreve a data por extenso e o dia relativo a hoje', () => {
    expect(dataPorExtenso('2026-10-01')).toBe('quinta-feira, 1 de outubro');
    expect(dataPorExtenso('2026-03-15')).toBe('domingo, 15 de março');
    expect(rotuloDiaRelativo('2026-10-05', '2026-10-05')).toBe('Hoje');
    expect(rotuloDiaRelativo('2026-10-06', '2026-10-05')).toBe('Amanhã');
    expect(rotuloDiaRelativo('2026-10-09', '2026-10-05')).toBe('Sexta, 09/10');
    expect(rotuloDiaRelativo(hojeISO())).toBe('Hoje');
  });
  it('calcula a hora de término da aula', () => {
    expect(horaFim('14:00', 45)).toBe('14:45');
    expect(horaFim('14:30', 90)).toBe('16:00');
    expect(horaFim('23:30', 45)).toBe('00:15');
  });
});
