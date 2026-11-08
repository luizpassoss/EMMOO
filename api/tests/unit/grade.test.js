import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { gerarGradeDeHorarios } from '../../src/domain/agenda.js';
import { nomeDaForma } from '../../src/domain/mensalidades.js';
import { createHorarioService } from '../../src/modules/horarios/horario.service.js';
import { validarGrade } from '../../src/modules/horarios/horario.validator.js';
import { createUsuarioService } from '../../src/modules/usuarios/usuario.service.js';
import { ForbiddenError, ValidationError } from '../../src/shared/errors.js';
import { hasherFake, reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed: o professor Luiz (id 2) atende segundas e quartas, 14:00, 14:45, 15:30 e 16:15 (45 min).
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };
const GRADE = { dias: [1, 2, 3, 4, 5], inicio: '14:00', fim: '18:00', duracaoMin: 45 };

describe('grade de atendimento do professor (RF04)', () => {
  it('gera aulas seguidas que terminam até o fim do período, nos dias escolhidos', () => {
    assert.deepEqual(gerarGradeDeHorarios({ dias: [3, 1], inicio: '14:00', fim: '16:00', duracaoMin: 45 }), [
      { diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 },
      { diaSemana: 1, horaInicio: '14:45', duracaoMin: 45 },
      { diaSemana: 3, horaInicio: '14:00', duracaoMin: 45 },
      { diaSemana: 3, horaInicio: '14:45', duracaoMin: 45 },
    ]);
    assert.deepEqual(
      gerarGradeDeHorarios({ dias: [6], inicio: '08:00', fim: '10:00', duracaoMin: 60 }).map((h) => h.horaInicio),
      ['08:00', '09:00'], // a última termina exatamente às 10:00
    );
    assert.equal(gerarGradeDeHorarios(GRADE).length, 25); // 5 dias × 14:00, 14:45, 15:30, 16:15, 17:00
  });

  it('valida dias, início, término e duração', () => {
    assert.equal(validarGrade(GRADE).dados.horarios.length, 25);
    assert.deepEqual(validarGrade({ ...GRADE, dias: ['1', '1', '3'] }).dados.dias, [1, 3]); // sem repetir
    assert.equal(validarGrade({ ...GRADE, duracaoMin: undefined }).dados.duracaoMin, 45); // padrão
    const campos = (input) => validarGrade(input).erros.map((erro) => erro.campo);
    assert.deepEqual(campos({}), ['dias', 'inicio', 'fim']);
    assert.deepEqual(campos({ ...GRADE, dias: [7] }), ['dias']);
    assert.deepEqual(campos({ ...GRADE, dias: 'segunda' }), ['dias']);
    assert.deepEqual(campos({ ...GRADE, fim: '13:00' }), ['fim']);
    assert.deepEqual(campos({ ...GRADE, duracaoMin: 10 }), ['duracaoMin']);
    assert.deepEqual(validarGrade({ ...GRADE, fim: '14:30' }).erros, [
      { campo: 'fim', mensagem: 'Entre o início e o término não cabe uma aula de 45 minutos.' },
    ]);
  });
});

describe('HorarioService.criarGrade e professor criado com horários', () => {
  let repos;
  let carla;
  const horarios = () =>
    createHorarioService({
      horarios: repos.horarios,
      aulas: repos.aulas,
      usuarios: repos.usuarios,
      feriados: repos.feriados,
      alunos: repos.alunos,
      hoje: () => '2026-10-05',
      agora: () => '08:00',
    });
  const usuariosServico = () => createUsuarioService({ usuarios: repos.usuarios, passwordHasher: hasherFake, horarios: repos.horarios });
  const novaProfessora = { nome: 'Bia', email: 'bia@emmoo.com.br', senha: 'segredo1', papel: 'professor' };

  beforeEach(async () => {
    ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-05' }));
    carla = await repos.usuarios.create({ nome: 'Carla', email: 'carla@emmoo.com.br', senhaHash: 'h', papel: 'professor' });
  });

  it('coordenação aplica a grade a um professor sem horários; as vagas já aparecem no agendamento', async () => {
    const resultado = await horarios().criarGrade({ ...GRADE, professorId: String(carla.id) }, COORDENACAO);
    assert.deepEqual([resultado.criados, resultado.ignorados, resultado.horarios.length], [25, 0, 25]);
    const vagas = await horarios().livres({ inicio: '2026-10-05', fim: '2026-10-05', professorId: carla.id }, COORDENACAO);
    assert.deepEqual(vagas.map((vaga) => vaga.hora), ['14:00', '14:45', '15:30', '16:15', '17:00']);
  });

  it('não duplica: pula o que se sobrepõe ao que o professor já tem', async () => {
    const resultado = await horarios().criarGrade(GRADE, PROFESSOR); // o Luiz já atende seg e qua, 14:00–17:00
    assert.deepEqual([resultado.criados, resultado.ignorados], [17, 8]); // seg/qua ganham só as 17:00
    assert.equal((await repos.horarios.list({ professorId: 2 })).length, 25);
    assert.deepEqual((await horarios().criarGrade(GRADE, PROFESSOR)).criados, 0); // aplicar de novo não muda nada
  });

  it('professor só na própria agenda; coordenação precisa dizer o professor; grade inválida não grava nada', async () => {
    await assert.rejects(horarios().criarGrade({ ...GRADE, professorId: carla.id }, PROFESSOR), ForbiddenError);
    await assert.rejects(horarios().criarGrade(GRADE, COORDENACAO), ValidationError);
    await assert.rejects(horarios().criarGrade({ ...GRADE, professorId: 1 }, COORDENACAO), ValidationError); // não é professor
    await assert.rejects(horarios().criarGrade({ dias: [], professorId: carla.id }, COORDENACAO), ValidationError);
    assert.equal((await repos.horarios.list({ professorId: carla.id })).length, 0);
  });

  it('professor novo já sai com a grade de atendimento', async () => {
    const criado = await usuariosServico().criar({ ...novaProfessora, horarios: { ...GRADE, dias: [2, 4] } });
    assert.equal(criado.horariosCriados, 10);
    const grade = await repos.horarios.list({ professorId: criado.id });
    assert.deepEqual([...new Set(grade.map((h) => h.diaSemana))], [2, 4]);
    assert.ok(grade.every((h) => h.duracaoMin === 45 && h.disponivel === true));
  });

  it('grade inválida: nem o acesso é criado, e o erro diz o campo da grade', async () => {
    await assert.rejects(usuariosServico().criar({ ...novaProfessora, horarios: { ...GRADE, fim: '13:00' } }), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'horarios.fim', mensagem: 'O término precisa ser depois do início.' }]);
      return true;
    });
    assert.equal(await repos.usuarios.findByEmail('bia@emmoo.com.br'), null);
  });

  it('sem grade, ou para outro perfil, nenhum horário é criado', async () => {
    assert.equal((await usuariosServico().criar(novaProfessora)).horariosCriados, 0);
    const responsavel = await usuariosServico().criar({
      ...novaProfessora,
      email: 'rui@x.com',
      papel: 'responsavel',
      horarios: GRADE,
    });
    assert.equal(responsavel.horariosCriados, 0);
    assert.equal((await repos.horarios.list({ professorId: responsavel.id })).length, 0);
  });
});

describe('formas de pagamento', () => {
  it('nome para a tela e o recibo, inclusive das formas aceitas antes', () => {
    assert.equal(nomeDaForma('pix'), 'Pix');
    assert.equal(nomeDaForma('dinheiro'), 'Dinheiro');
    assert.equal(nomeDaForma('cartao'), 'Cartão');
    assert.equal(nomeDaForma(null), null);
    assert.equal(nomeDaForma('cheque'), null);
  });
});
