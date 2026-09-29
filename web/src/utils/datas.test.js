import { describe, expect, it } from 'vitest';
import {
  diaDaSemana,
  diasDaSemana,
  formatarData,
  horaAtual,
  hojeISO,
  horaFim,
  inicioDaSemana,
  rotuloDia,
  rotuloSemana,
  somarDias,
} from './datas.js';

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
  it('semana começa na segunda-feira', () => {
    expect(diaDaSemana('2026-10-04')).toBe(0);
    expect(inicioDaSemana('2026-10-07')).toBe('2026-10-05'); // quarta
    expect(inicioDaSemana('2026-10-05')).toBe('2026-10-05'); // segunda
    expect(inicioDaSemana('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(diasDaSemana('2026-10-05')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });
  it('formata dia e semana em português', () => {
    expect(formatarData('2026-10-05')).toBe('05/10');
    expect(rotuloDia('2026-10-05')).toBe('Segunda, 05/10');
    expect(rotuloSemana('2026-10-05')).toBe('5 – 11 out 2026');
    expect(rotuloSemana('2026-09-28')).toBe('28 set – 4 out 2026');
    expect(rotuloSemana('2026-12-28')).toBe('28 dez 2026 – 3 jan 2027');
  });
  it('calcula a hora de término da aula', () => {
    expect(horaFim('14:00', 45)).toBe('14:45');
    expect(horaFim('14:30', 90)).toBe('16:00');
    expect(horaFim('23:30', 45)).toBe('00:15');
  });
});
