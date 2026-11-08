import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calcularHorariosLivres,
  encontrarAulaEmConflito,
  gerarDatasSemanais,
  horariosSeSobrepoem,
  intervaloDaAula,
  ocupaHorario,
  porDataEHora,
  SEMANAS_MAXIMAS,
} from '../../src/domain/agenda.js';
import {
  diaDaSemana,
  diferencaEmDias,
  formatarDataBR,
  hojeISO,
  isDataISO,
  isHora,
  paraDataISO,
  paraDate,
  somarDias,
} from '../../src/shared/datas.js';

describe('datas de calendário', () => {
  it('valida datas "AAAA-MM-DD" reais', () => {
    assert.equal(isDataISO('2026-02-28'), true);
    assert.equal(isDataISO('2028-02-29'), true); // bissexto
    for (const invalida of ['2026-02-30', '2026-13-01', '28/02/2026', '2026-2-8', '', null, 20260228]) {
      assert.equal(isDataISO(invalida), false, String(invalida));
    }
  });
  it('valida horas "HH:MM"', () => {
    assert.equal(isHora('00:00'), true);
    assert.equal(isHora('23:59'), true);
    for (const invalida of ['24:00', '9:00', '12:60', '12h00', undefined]) {
      assert.equal(isHora(invalida), false, String(invalida));
    }
  });
  it('converte, soma dias e atravessa meses e anos', () => {
    assert.equal(paraDate('2026-10-05', '14:30').toISOString(), '2026-10-05T14:30:00.000Z');
    assert.equal(paraDataISO(paraDate('2026-10-05')), '2026-10-05');
    assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
    assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
    assert.equal(diferencaEmDias('2026-10-05', '2026-11-05'), 31);
    assert.equal(diferencaEmDias('2026-10-05', '2026-10-01'), -4);
  });
  it('dia da semana segue a convenção do schema (0 = domingo)', () => {
    assert.equal(diaDaSemana('2026-10-04'), 0);
    assert.equal(diaDaSemana('2026-10-05'), 1);
  });
  it('formata para o padrão brasileiro e obtém a data local de hoje', () => {
    assert.equal(formatarDataBR('2026-10-05'), '05/10/2026');
    assert.equal(hojeISO(new Date(2026, 0, 9, 23, 30)), '2026-01-09');
    assert.ok(isDataISO(hojeISO()));
  });
});

describe('agenda — intervalos e conflitos (RN09/RN10)', () => {
  const aula = (hora, extra = {}) => ({ data: '2026-10-05', hora, duracaoMin: 45, status: 'agendada', ...extra });

  it('cria o intervalo da aula', () => {
    const { inicio, fim } = intervaloDaAula(aula('14:00'));
    assert.equal(inicio.toISOString(), '2026-10-05T14:00:00.000Z');
    assert.equal(fim.toISOString(), '2026-10-05T14:45:00.000Z');
  });
  it('aula cancelada ou com falta avisada libera o horário; agendada e realizada ocupam', () => {
    assert.equal(ocupaHorario(aula('14:00')), true);
    assert.equal(ocupaHorario(aula('14:00', { status: 'realizada' })), true);
    assert.equal(ocupaHorario(aula('14:00', { status: 'cancelada' })), false);
    assert.equal(ocupaHorario(aula('14:00', { status: 'falta' })), false); // o horário vai para a reposição de outro aluno
  });
  it('encontra a aula em conflito, ignorando canceladas e aulas que só se encostam', () => {
    const existentes = [aula('13:15'), aula('14:00', { status: 'cancelada' }), aula('14:30', { id: 7 })];
    assert.equal(encontrarAulaEmConflito(aula('14:00'), existentes).id, 7);
    assert.equal(encontrarAulaEmConflito(aula('12:30'), existentes), null);
    assert.equal(encontrarAulaEmConflito(aula('12:30')), null);
  });
  it('compara horários disponíveis apenas no mesmo dia da semana', () => {
    const segunda = { diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 };
    assert.equal(horariosSeSobrepoem(segunda, { ...segunda, horaInicio: '14:30' }), true);
    assert.equal(horariosSeSobrepoem(segunda, { ...segunda, horaInicio: '14:45' }), false);
    assert.equal(horariosSeSobrepoem(segunda, { ...segunda, diaSemana: 2 }), false);
  });
  it('ordena por data e hora', () => {
    const lista = [aula('15:00', { data: '2026-10-06' }), aula('16:00'), aula('09:00')];
    assert.deepEqual(lista.sort(porDataEHora).map((a) => `${a.data} ${a.hora}`), [
      '2026-10-05 09:00',
      '2026-10-05 16:00',
      '2026-10-06 15:00',
    ]);
  });
});

describe('agenda — aula semanal', () => {
  it('gera as datas das semanas seguintes', () => {
    assert.deepEqual(gerarDatasSemanais('2026-10-26', 3), ['2026-10-26', '2026-11-02', '2026-11-09']);
    assert.deepEqual(gerarDatasSemanais('2026-10-26'), ['2026-10-26']);
  });
  it('limita a quantidade de semanas', () => {
    assert.equal(gerarDatasSemanais('2026-01-05', SEMANAS_MAXIMAS).length, SEMANAS_MAXIMAS);
    for (const invalido of [0, SEMANAS_MAXIMAS + 1, 1.5]) {
      assert.throws(() => gerarDatasSemanais('2026-01-05', invalido), RangeError);
    }
  });
});

describe('RF05 — horários livres', () => {
  const horarios = [
    { diaSemana: 1, horaInicio: '15:00', duracaoMin: 45 },
    { diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 },
    { diaSemana: 3, horaInicio: '14:00', duracaoMin: 45, disponivel: false },
  ];

  it('gera uma vaga por horário em cada dia do período, em ordem', () => {
    const livres = calcularHorariosLivres({ horarios, inicio: '2026-10-05', fim: '2026-10-12' });
    assert.deepEqual(livres, [
      { data: '2026-10-05', hora: '14:00', duracaoMin: 45 },
      { data: '2026-10-05', hora: '15:00', duracaoMin: 45 },
      { data: '2026-10-12', hora: '14:00', duracaoMin: 45 },
      { data: '2026-10-12', hora: '15:00', duracaoMin: 45 },
    ]);
  });
  it('remove vagas ocupadas por aulas (mesmo parcialmente) e ignora horários indisponíveis', () => {
    const aulas = [{ data: '2026-10-05', hora: '14:30', duracaoMin: 45, status: 'agendada' }];
    const livres = calcularHorariosLivres({ horarios, aulas, inicio: '2026-10-05', fim: '2026-10-07' });
    assert.deepEqual(livres, []);
  });
  it('período invertido é erro; sem horários não há vagas', () => {
    assert.throws(() => calcularHorariosLivres({ horarios, inicio: '2026-10-07', fim: '2026-10-05' }), RangeError);
    assert.deepEqual(calcularHorariosLivres({ inicio: '2026-10-05', fim: '2026-10-05' }), []);
  });
});
