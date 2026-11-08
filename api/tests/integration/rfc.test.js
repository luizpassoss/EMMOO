import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';

// Ponta a ponta das funcionalidades de falta, reposição, presença, diário, mensalidades, painel, histórico e
// relatórios (RF06–RF15), com a escola de demonstração. O seed começa na semana atual (relógio real).
let server;
let baseUrl;

before(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'memory', JWT_SECRET: 'segredo-de-teste' });
  const { auth, escolas, servicosDaEscola, tokenService } = await createContainer(env);
  const app = createApp({ auth, escolas, servicosDaEscola, tokenService, corsOrigin: env.corsOrigin, logger: { error() {} } });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/** Chama a API; JSON vira objeto, o resto (PDF) volta como Buffer, com os cabeçalhos. */
async function chamar(metodo, caminho, { token, corpo } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = resposta.headers.get('content-type') ?? '';
  const bruto = Buffer.from(await resposta.arrayBuffer());
  const body = tipo.includes('json') ? JSON.parse(bruto.toString()) : bruto;
  return { status: resposta.status, body, headers: resposta.headers };
}

/** Data local "AAAA-MM-DD" daqui a N dias. */
function dia(dias = 0) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

async function logar(login, senha) {
  const { status, body } = await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login, senha } });
  assert.equal(status, 200);
  return body.token;
}

describe('API EMMOO — RF06 a RF15', () => {
  let coordenacao;
  let professor;
  let responsavel;
  let aulaDaAna; // aula futura da Ana (dependente da Mary), a pelo menos 2 dias
  let reposicao;

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
    responsavel = await logar('mary@emmoo.com.br', 'emmoo123');
    const { body } = await chamar('GET', `/aulas?inicio=${dia(2)}&fim=${dia(20)}`, { token: responsavel });
    aulaDaAna = body.find((aula) => aula.status === 'agendada');
    assert.ok(aulaDaAna, 'a Ana deveria ter aula nos próximos 20 dias');
  });

  it('GET /aulas/:id — detalhe com as ações de cada papel', async () => {
    const daMary = await chamar('GET', `/aulas/${aulaDaAna.id}`, { token: responsavel });
    assert.equal(daMary.status, 200);
    assert.deepEqual(daMary.body.acoes, {
      registrar: false,
      cancelar: false,
      remarcar: false,
      avisarFalta: true,
      solicitarReposicao: false,
    });
    assert.ok(daMary.body.horasAteAAula >= 24);
    const daCoordenacao = await chamar('GET', `/aulas/${aulaDaAna.id}`, { token: coordenacao });
    assert.deepEqual([daCoordenacao.body.acoes.cancelar, daCoordenacao.body.acoes.remarcar], [true, true]);
    assert.equal((await chamar('GET', '/aulas/9999', { token: coordenacao })).status, 404);
  });

  it('POST /aulas/:id/falta — RF06: só a família e a coordenação; com 24h, libera reposição', async () => {
    assert.equal((await chamar('POST', `/aulas/${aulaDaAna.id}/falta`, { token: professor })).status, 403);
    const aviso = await chamar('POST', `/aulas/${aulaDaAna.id}/falta`, { token: responsavel });
    assert.equal(aviso.status, 200);
    assert.deepEqual([aviso.body.aula.status, aviso.body.liberaReposicao], ['falta', true]);
    assert.equal((await chamar('POST', `/aulas/${aulaDaAna.id}/falta`, { token: responsavel })).status, 409);
  });

  it('reposições — RF07: lista o direito, as vagas, e marca no horário livre', async () => {
    assert.equal((await chamar('GET', '/reposicoes/disponiveis', { token: professor })).status, 403);
    const disponiveis = await chamar('GET', '/reposicoes/disponiveis', { token: responsavel });
    assert.equal(disponiveis.status, 200);
    assert.deepEqual(disponiveis.body.map((credito) => [credito.aula.id, credito.permitido]), [[aulaDaAna.id, true]]);

    const { status, body } = await chamar('GET', `/reposicoes/${aulaDaAna.id}/vagas`, { token: responsavel });
    assert.equal(status, 200);
    assert.ok(body.vagas.length > 0);
    assert.ok(!body.vagas.some((vaga) => vaga.data === aulaDaAna.data && vaga.hora === aulaDaAna.hora));
    const [vaga] = body.vagas;

    const invalido = await chamar('POST', '/reposicoes', { token: responsavel, corpo: {} });
    assert.equal(invalido.status, 400);
    const ocupado = await chamar('POST', '/reposicoes', {
      token: responsavel,
      corpo: { aulaId: aulaDaAna.id, data: aulaDaAna.data, hora: aulaDaAna.hora },
    });
    assert.deepEqual([ocupado.status, ocupado.body.error.message], [409, 'Horário indisponível.']);
    assert.match(ocupado.body.error.details[0].mensagem, /Horários livres no prazo/);

    const marcada = await chamar('POST', '/reposicoes', { token: responsavel, corpo: { aulaId: aulaDaAna.id, ...vaga } });
    assert.equal(marcada.status, 201);
    assert.deepEqual([marcada.body.aula.reposicaoDeId, marcada.body.reposicaoDe.id], [aulaDaAna.id, aulaDaAna.id]);
    reposicao = marcada.body.aula;
    assert.equal((await chamar('GET', `/aulas/${aulaDaAna.id}`, { token: responsavel })).body.reposicaoMarcada.id, reposicao.id);
  });

  it('presença e diário — RF08/RF09: só a escola, e só a partir do início da aula', async () => {
    assert.equal((await chamar('PATCH', `/aulas/${reposicao.id}/presenca`, { token: responsavel, corpo: { status: 'realizada' } })).status, 403);
    const cedo = await chamar('PATCH', `/aulas/${reposicao.id}/presenca`, { token: professor, corpo: { status: 'realizada' } });
    assert.equal(cedo.status, 400);
    assert.equal((await chamar('PUT', `/aulas/${reposicao.id}/diario`, { token: responsavel, corpo: {} })).status, 403);

    // Uma aula que já começou: das que o seed criou nesta semana (se ainda houver alguma no passado).
    const { body: semana } = await chamar('GET', `/aulas?inicio=${dia(-7)}&fim=${dia(0)}`, { token: professor });
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    const passada = semana.find((aula) => aula.status === 'agendada' && (aula.data < dia(0) || aula.hora <= hora));
    if (!passada) return; // início da semana, antes da primeira aula: nada a registrar ainda

    const presenca = await chamar('PATCH', `/aulas/${passada.id}/presenca`, { token: professor, corpo: { status: 'realizada' } });
    assert.deepEqual([presenca.status, presenca.body.status], [200, 'realizada']);
    const diario = await chamar('PUT', `/aulas/${passada.id}/diario`, {
      token: professor,
      corpo: { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos' },
    });
    assert.deepEqual(diario.body, { aulaId: passada.id, conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos' });
    const vazio = await chamar('PUT', `/aulas/${passada.id}/diario`, { token: professor, corpo: { conteudoMinistrado: '' } });
    assert.deepEqual([vazio.status, vazio.body.error.details[0].campo], [400, 'conteudoMinistrado']);
  });

  it('mensalidades — RF10/RF11/RF15: gera, dá baixa, emite recibo em PDF; responsável só vê as suas', async () => {
    const mes = dia(0).slice(0, 7);
    assert.equal((await chamar('POST', '/mensalidades/gerar', { token: responsavel, corpo: { mes } })).status, 403);
    assert.equal((await chamar('GET', '/mensalidades', { token: professor })).status, 403);
    const gerou = await chamar('POST', '/mensalidades/gerar', { token: coordenacao, corpo: { mes } });
    assert.deepEqual([gerou.status, gerou.body.criadas], [200, 2]);

    const { body: lista } = await chamar('GET', `/mensalidades?mes=${mes}`, { token: coordenacao });
    assert.deepEqual(lista.map((m) => m.aluno.nome), ['Ana Beatriz', 'Pedro Henrique']);
    const [daAna, doPedro] = lista;
    assert.equal((await chamar('GET', `/mensalidades/${daAna.id}/recibo`, { token: coordenacao })).status, 409);

    const pagar = (id, token = coordenacao) =>
      chamar('PATCH', `/mensalidades/${id}/pagamento`, { token, corpo: { dataPagamento: dia(0), formaPagamento: 'pix' } });
    assert.equal((await pagar(daAna.id, professor)).status, 403);
    const paga = await pagar(daAna.id);
    assert.deepEqual([paga.status, paga.body.status, paga.body.formaPagamentoNome], [200, 'paga', 'Pix']);
    assert.equal((await pagar(daAna.id)).status, 409);

    const recibo = await chamar('GET', `/mensalidades/${daAna.id}/recibo`, { token: responsavel });
    assert.equal(recibo.status, 200);
    assert.equal(recibo.headers.get('content-type'), 'application/pdf');
    assert.equal(recibo.headers.get('content-disposition'), `attachment; filename="recibo-${mes}-ana-beatriz.pdf"`);
    assert.equal(recibo.body.subarray(0, 5).toString(), '%PDF-');

    const { body: daMary } = await chamar('GET', '/mensalidades', { token: responsavel });
    assert.deepEqual(daMary.map((m) => m.aluno.nome), ['Ana Beatriz']);
    await pagar(doPedro.id);
    assert.equal((await chamar('GET', `/mensalidades/${doPedro.id}/recibo`, { token: responsavel })).status, 404);

    const desfeita = await chamar('DELETE', `/mensalidades/${doPedro.id}/pagamento`, { token: coordenacao });
    assert.deepEqual([desfeita.status, desfeita.body.dataPagamento], [200, null]);
  });

  it('alertas — RF12: resumo e envio só para a coordenação; sem SMTP, ficam pendentes', async () => {
    assert.equal((await chamar('GET', '/mensalidades/alertas', { token: responsavel })).status, 403);
    const resumo = await chamar('GET', '/mensalidades/alertas', { token: coordenacao });
    assert.equal(resumo.status, 200);
    assert.equal(resumo.body.email.configurado, false);
    const envio = await chamar('POST', '/mensalidades/alertas/enviar', { token: coordenacao });
    assert.deepEqual([envio.status, envio.body.enviados], [200, 0]);
  });

  it('GET /indicadores — RF13: cada papel recebe o seu painel', async () => {
    const daCoordenacao = await chamar('GET', '/indicadores', { token: coordenacao });
    assert.deepEqual([daCoordenacao.status, daCoordenacao.body.papel, daCoordenacao.body.alunosAtivos], [200, 'coordenacao', 2]);
    assert.equal(daCoordenacao.body.mesAtual.geradas, 2);
    assert.equal((await chamar('GET', '/indicadores', { token: professor })).body.papel, 'professor');
    const daMary = await chamar('GET', '/indicadores', { token: responsavel });
    assert.deepEqual(daMary.body.dependentes.map((d) => d.aluno.nome), ['Ana Beatriz']);
    assert.equal((await chamar('GET', '/indicadores')).status, 401);
  });

  it('GET /alunos/:id/historico — RF14: coordenação tudo; responsável só dos dependentes; professor sem financeiro', async () => {
    const completo = await chamar('GET', '/alunos/1/historico', { token: coordenacao });
    assert.equal(completo.status, 200);
    assert.equal(completo.body.aluno.contato, '(47) 99999-0001');
    assert.equal(completo.body.reposicoes.length, 1);
    assert.equal(completo.body.mensalidades.length, 1);
    assert.equal((await chamar('GET', '/alunos/1/historico', { token: responsavel })).status, 200);
    assert.equal((await chamar('GET', '/alunos/2/historico', { token: responsavel })).status, 404);
    const doProfessor = await chamar('GET', '/alunos/1/historico', { token: professor });
    assert.deepEqual([doProfessor.status, doProfessor.body.aluno.contato, doProfessor.body.mensalidades], [200, undefined, []]);
  });

  it('relatórios — RF15: resumo do mês e PDF, só para a coordenação', async () => {
    const mes = dia(0).slice(0, 7);
    const relatorio = await chamar('GET', `/relatorios/mensal?mes=${mes}`, { token: coordenacao });
    assert.equal(relatorio.status, 200);
    assert.deepEqual(relatorio.body.financeiro.quantidade, { paga: 1, pendente: 1, atrasada: 0, cancelada: 0 });
    assert.equal((await chamar('GET', '/relatorios/mensal?mes=2026-13', { token: coordenacao })).status, 400);
    const pdf = await chamar('GET', `/relatorios/mensal/pdf?mes=${mes}`, { token: coordenacao });
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.headers.get('content-disposition'), `attachment; filename="relatorio-${mes}.pdf"`);
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await chamar('GET', '/relatorios/mensal', { token: professor })).status, 403);
    assert.equal((await chamar('GET', '/relatorios/mensal', { token: responsavel })).status, 403);
  });

  it('histórico de pagamentos — RF11: coordenação vê todos; responsável, os dos dependentes; só Pix ou dinheiro', async () => {
    const todos = await chamar('GET', '/mensalidades/pagamentos', { token: coordenacao });
    assert.equal(todos.status, 200);
    assert.deepEqual(todos.body.pagamentos.map((m) => m.aluno.nome), ['Ana Beatriz']); // o do Pedro foi desfeito
    assert.equal(todos.body.totais.porForma.pix.quantidade, 1);
    const daMary = await chamar('GET', '/mensalidades/pagamentos', { token: responsavel });
    assert.deepEqual(daMary.body.pagamentos.map((m) => m.aluno.nome), ['Ana Beatriz']);
    assert.equal((await chamar('GET', '/mensalidades/pagamentos', { token: professor })).status, 403);

    const { body: lista } = await chamar('GET', '/mensalidades', { token: coordenacao });
    const aberta = lista.find((m) => m.status !== 'paga');
    const cartao = await chamar('PATCH', `/mensalidades/${aberta.id}/pagamento`, {
      token: coordenacao,
      corpo: { dataPagamento: dia(0), formaPagamento: 'cartao' },
    });
    assert.deepEqual([cartao.status, cartao.body.error.details[0].campo], [400, 'formaPagamento']);
  });

  it('professor novo já sai com horários de atendimento; a grade também completa a de quem já existe', async () => {
    const criado = await chamar('POST', '/usuarios', {
      token: coordenacao,
      corpo: {
        papel: 'professor',
        nome: 'Ronan',
        email: 'ronan@emmoo.com.br',
        senha: 'segredo1',
        horarios: { dias: [2, 4], inicio: '08:00', fim: '10:00', duracaoMin: 60 },
      },
    });
    assert.deepEqual([criado.status, criado.body.horariosCriados], [201, 4]);
    const { body: grade } = await chamar('GET', `/horarios?professorId=${criado.body.id}`, { token: coordenacao });
    assert.deepEqual(grade.map((h) => `${h.diaSemana} ${h.horaInicio}`), ['2 08:00', '2 09:00', '4 08:00', '4 09:00']);

    const mais = await chamar('POST', '/horarios/grade', {
      token: coordenacao,
      corpo: { professorId: criado.body.id, dias: [2, 6], inicio: '08:00', fim: '10:00', duracaoMin: 60 },
    });
    assert.deepEqual([mais.status, mais.body.criados, mais.body.ignorados], [201, 2, 2]); // terça já existia
    assert.equal((await chamar('POST', '/horarios/grade', { token: responsavel, corpo: {} })).status, 403);
  });
});
