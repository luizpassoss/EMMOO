import { gerarDatasSemanais } from '../../domain/agenda.js';
import { diaDaSemana, hojeISO, somarDias } from '../../shared/datas.js';

/** Senha dos usuários de demonstração — apenas para desenvolvimento. */
export const SENHA_DEMO = 'emmoo123';

/** Horários de atendimento do professor de demonstração: segundas e quartas, 14:00 às 17:00. */
export const HORARIOS_DEMO = [1, 3].flatMap((diaSemana) =>
  ['14:00', '14:45', '15:30', '16:15'].map((horaInicio) => ({ diaSemana, horaInicio, duracaoMin: 45 })),
);

/**
 * Popula os repositórios em memória com dados de demonstração (personas da RFC).
 * As aulas começam na semana de `hoje`, para a agenda nunca aparecer vazia na demonstração.
 */
export async function seedMemoria({ usuarios, planos, alunos, horarios, aulas }, passwordHasher, { hoje = hojeISO() } = {}) {
  const senhaHash = await passwordHasher.hash(SENHA_DEMO);
  await usuarios.create({ nome: 'Lucimara', email: 'lucimara@emmoo.com.br', senhaHash, papel: 'coordenacao' });
  const luiz = await usuarios.create({ nome: 'Luiz', email: 'luiz@emmoo.com.br', senhaHash, papel: 'professor' });
  const mary = await usuarios.create({ nome: 'Mary', email: 'mary@emmoo.com.br', senhaHash, papel: 'responsavel' });

  const particular = await planos.create({
    nome: 'Particular 1x/semana',
    tipo: 'particular',
    valor: 140,
    freqSemanal: 1,
    duracaoMin: 45,
  });

  const ana = await alunos.create({
    nome: 'Ana Beatriz',
    contato: '(47) 99999-0001',
    instrumento: 'Violino',
    planoId: particular.id,
    usuarioRespId: mary.id,
    status: 'ativo',
  });
  const pedro = await alunos.create({
    nome: 'Pedro Henrique',
    contato: '(47) 99999-0002',
    instrumento: 'Violão',
    planoId: particular.id,
    usuarioRespId: null,
    status: 'ativo',
  });

  for (const horario of HORARIOS_DEMO) {
    await horarios.create({ ...horario, professorId: luiz.id, disponivel: true });
  }

  const segundaDaSemana = somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  const serie = (aluno, primeiraData, hora) =>
    gerarDatasSemanais(primeiraData, 8).map((data) => ({
      alunoId: aluno.id,
      professorId: luiz.id,
      data,
      hora,
      duracaoMin: 45,
      status: 'agendada',
    }));
  await aulas.createMany([...serie(ana, segundaDaSemana, '14:00'), ...serie(pedro, somarDias(segundaDaSemana, 2), '15:30')]);
}
