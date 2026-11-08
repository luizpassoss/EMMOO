import { gerarDatasSemanais } from '../../domain/agenda.js';
import { diaDaSemana, hojeISO, somarDias } from '../../shared/datas.js';

/**
 * Usuários de demonstração (personas da RFC) — APENAS para desenvolvimento: troque as senhas antes de uso real.
 * Quem tem `login` entra com ele ou com o e-mail; quem não tem, só com o e-mail.
 */
export const USUARIOS_DEMO = [
  { nome: 'Lucimara', email: 'lucimara@emmoo.com.br', login: 'admin', senha: 'admin', papel: 'coordenacao' },
  { nome: 'Luiz', email: 'luiz@emmoo.com.br', login: 'luiz', senha: 'Luiz123', papel: 'professor' },
  { nome: 'Mary', email: 'mary@emmoo.com.br', login: null, senha: 'emmoo123', papel: 'responsavel' },
];

/** Planos de demonstração: particular e em grupo, com 1 e 2 aulas por semana (o primeiro é o dos alunos de exemplo). */
export const PLANOS_DEMO = [
  { nome: 'Particular · 1 aula por semana', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 },
  { nome: 'Particular · 2 aulas por semana', tipo: 'particular', valor: 260, freqSemanal: 2, duracaoMin: 45 },
  { nome: 'Grupo · 1 aula por semana', tipo: 'grupo', valor: 90, freqSemanal: 1, duracaoMin: 60 },
  { nome: 'Grupo · 2 aulas por semana', tipo: 'grupo', valor: 170, freqSemanal: 2, duracaoMin: 60 },
];

/** Horários de atendimento do professor de demonstração: segundas e quartas, 14:00 às 17:00. */
export const HORARIOS_DEMO = [1, 3].flatMap((diaSemana) =>
  ['14:00', '14:45', '15:30', '16:15'].map((horaInicio) => ({ diaSemana, horaInicio, duracaoMin: 45 })),
);

/** Escola de demonstração. O código é o que se digita no login. */
export const ESCOLA_DEMO = { nome: 'Escola de Música EMMOO', codigo: 'emmoo' };

/**
 * Popula os repositórios em memória com dados de demonstração (personas da RFC), dentro da escola EMMOO.
 * As aulas começam na semana de `hoje`, para a agenda nunca aparecer vazia na demonstração.
 * @returns {Promise<{ escola: object }>}
 */
export async function seedMemoria(repositorios, passwordHasher, { hoje = hojeISO() } = {}) {
  const escola = await repositorios.escolas.create(ESCOLA_DEMO);
  const { usuarios, planos, alunos, horarios, aulas } = repositorios.paraEscola(escola.id);

  const criados = [];
  for (const { senha, ...usuario } of USUARIOS_DEMO) {
    criados.push(await usuarios.create({ ...usuario, senhaHash: await passwordHasher.hash(senha) }));
  }
  const [, luiz, mary] = criados;

  const planosCriados = [];
  for (const plano of PLANOS_DEMO) planosCriados.push(await planos.create(plano));
  const [particular] = planosCriados; // "Particular · 1 aula por semana", o plano dos alunos de exemplo

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
      motivoCancelamento: null,
    }));
  await aulas.createMany([...serie(ana, segundaDaSemana, '14:00'), ...serie(pedro, somarDias(segundaDaSemana, 2), '15:30')]);
  return { escola };
}
