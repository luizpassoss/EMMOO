import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validarAluno } from '../../src/modules/alunos/aluno.validator.js';
import { validarAgendamento } from '../../src/modules/aulas/aula.validator.js';
import { validarHorario } from '../../src/modules/horarios/horario.validator.js';
import { validarPlano } from '../../src/modules/planos/plano.validator.js';
import { AppError, ValidationError } from '../../src/shared/errors.js';
import {
  assertValid,
  isNonEmptyString,
  isVazio,
  parseId,
  parseIdOpcional,
  toNumber,
  validarPeriodo,
} from '../../src/shared/validation.js';

describe('utilitários de validação', () => {
  it('isNonEmptyString considera espaços e tamanho mínimo', () => {
    assert.equal(isNonEmptyString('  ab  ', 2), true);
    assert.equal(isNonEmptyString('   '), false);
    assert.equal(isNonEmptyString(42), false);
  });
  it('toNumber aceita número ou texto numérico', () => {
    assert.equal(toNumber(3), 3);
    assert.equal(toNumber(' 7 '), 7);
    assert.ok(Number.isNaN(toNumber('')));
    assert.ok(Number.isNaN(toNumber(true)));
    assert.ok(Number.isNaN(toNumber(null)));
  });
  it('parseId aceita apenas inteiros positivos', () => {
    assert.equal(parseId('12'), 12);
    for (const invalido of ['0', '-1', '1.5', 'abc', undefined]) {
      assert.throws(() => parseId(invalido), ValidationError);
    }
  });
  it('isVazio reconhece campos opcionais não informados', () => {
    assert.deepEqual([undefined, null, '', 0, ' '].map(isVazio), [true, true, true, false, false]);
  });
  it('parseIdOpcional devolve undefined quando vazio e valida o resto', () => {
    assert.equal(parseIdOpcional('', 'professorId'), undefined);
    assert.equal(parseIdOpcional('4', 'professorId'), 4);
    assert.throws(() => parseIdOpcional('0', 'professorId'), (erro) => erro.details[0].campo === 'professorId');
  });
  it('validarPeriodo exige datas válidas, em ordem e dentro do limite', () => {
    assert.deepEqual(validarPeriodo({ inicio: '2026-10-05', fim: '2026-10-05' }, 7), { inicio: '2026-10-05', fim: '2026-10-05' });
    const campos = (periodo) => {
      try {
        validarPeriodo(periodo, 7);
        return [];
      } catch (erro) {
        return erro.details.map((d) => d.campo);
      }
    };
    assert.deepEqual(campos(), ['inicio', 'fim']);
    assert.deepEqual(campos({ inicio: '2026-10-05', fim: '2026-10-04' }), ['fim']);
    assert.deepEqual(campos({ inicio: '2026-10-05', fim: '2026-10-13' }), ['fim']);
    assert.deepEqual(campos({ inicio: '2026-10-05', fim: '2026-10-12' }), []);
  });
  it('assertValid só lança quando há erros', () => {
    assert.doesNotThrow(() => assertValid([]));
    assert.throws(() => assertValid([{ campo: 'x', mensagem: 'y' }]), (erro) => {
      assert.ok(erro instanceof AppError);
      assert.equal(erro.status, 400);
      assert.deepEqual(erro.details, [{ campo: 'x', mensagem: 'y' }]);
      return true;
    });
  });
});

describe('validarPlano (RF03)', () => {
  const valido = { nome: ' Particular 1x ', tipo: 'particular', valor: '140', freqSemanal: 1 };

  it('normaliza um plano válido e aplica duração padrão de 45 min', () => {
    const { erros, dados } = validarPlano(valido);
    assert.deepEqual(erros, []);
    assert.deepEqual(dados, { nome: 'Particular 1x', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 });
  });
  it('arredonda o valor para centavos', () => {
    assert.equal(validarPlano({ ...valido, valor: 99.999 }).dados.valor, 100);
  });
  it('aponta todos os campos inválidos', () => {
    const { erros, dados } = validarPlano({ nome: 'A', tipo: 'vip', valor: 0, freqSemanal: 9, duracaoMin: 5 });
    assert.equal(dados, null);
    assert.deepEqual(erros.map((e) => e.campo), ['nome', 'tipo', 'valor', 'freqSemanal', 'duracaoMin']);
  });
  it('trata entrada ausente', () => {
    assert.equal(validarPlano().erros.length, 4);
  });
});

describe('validarAluno (RF02)', () => {
  const valido = { nome: ' Ana ', contato: '(47) 99999-0001', instrumento: 'Violino', planoId: '1' };

  it('normaliza um aluno válido sem responsável', () => {
    const { erros, dados } = validarAluno(valido);
    assert.deepEqual(erros, []);
    assert.deepEqual(dados, {
      nome: 'Ana',
      contato: '(47) 99999-0001',
      instrumento: 'Violino',
      planoId: 1,
      usuarioRespId: null,
    });
  });
  it('aceita responsável opcional', () => {
    assert.equal(validarAluno({ ...valido, usuarioRespId: 3 }).dados.usuarioRespId, 3);
    assert.equal(validarAluno({ ...valido, usuarioRespId: '' }).dados.usuarioRespId, null);
  });
  it('aponta os campos inválidos', () => {
    const { erros, dados } = validarAluno({ nome: '', contato: '123', instrumento: '', planoId: 'x', usuarioRespId: -2 });
    assert.equal(dados, null);
    assert.deepEqual(erros.map((e) => e.campo), ['nome', 'contato', 'instrumento', 'planoId', 'usuarioRespId']);
  });
  it('trata entrada ausente', () => {
    assert.equal(validarAluno().erros.length, 4);
  });
});

describe('validarHorario (RF04)', () => {
  it('normaliza e aplica duração padrão de 45 min', () => {
    assert.deepEqual(validarHorario({ diaSemana: '1', horaInicio: '14:00', duracaoMin: '' }).dados, {
      diaSemana: 1,
      horaInicio: '14:00',
      duracaoMin: 45,
      professorId: undefined,
    });
    assert.equal(validarHorario({ diaSemana: 0, horaInicio: '08:00', professorId: '2' }).dados.professorId, 2);
  });
  it('aponta os campos inválidos', () => {
    const { erros, dados } = validarHorario({ diaSemana: 7, horaInicio: '8h', duracaoMin: 10, professorId: 'x' });
    assert.equal(dados, null);
    assert.deepEqual(erros.map((e) => e.campo), ['diaSemana', 'horaInicio', 'duracaoMin', 'professorId']);
    assert.equal(validarHorario().erros.length, 2);
  });
});

describe('validarAgendamento (RF05)', () => {
  const valido = { alunoId: '1', professorId: 2, data: '2026-10-05', hora: '14:00' };

  it('normaliza: duração do plano (null) e uma semana por padrão', () => {
    assert.deepEqual(validarAgendamento(valido).dados, {
      alunoId: 1,
      professorId: 2,
      data: '2026-10-05',
      hora: '14:00',
      duracaoMin: null,
      semanas: 1,
    });
    const serie = validarAgendamento({ ...valido, duracaoMin: '60', semanas: '4' }).dados;
    assert.deepEqual([serie.duracaoMin, serie.semanas], [60, 4]);
  });
  it('aponta os campos inválidos', () => {
    const { erros, dados } = validarAgendamento({
      alunoId: 0,
      professorId: 'x',
      data: '2026-02-30',
      hora: '14:00:00',
      duracaoMin: 300,
      semanas: 27,
    });
    assert.equal(dados, null);
    assert.deepEqual(erros.map((e) => e.campo), ['alunoId', 'professorId', 'data', 'hora', 'duracaoMin', 'semanas']);
    assert.equal(validarAgendamento().erros.length, 4);
  });
});
