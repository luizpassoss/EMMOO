import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';

// Ponta a ponta do que a escola usa no dia a dia além da RFC: ajuste e cancelamento de cobrança, recibo numerado,
// Pix da escola, remarcação de aula, troca e recuperação de senha, limite de tentativas de login, planilhas para a
// contabilidade e feriados nacionais. Escola de demonstração, relógio real; a API confia no proxy (X-Forwarded-For).
let server;
let baseUrl;

before(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'memory', JWT_SECRET: 'segredo-de-teste', TRUST_PROXY: 'true' });
  const { auth, escolas, servicosDaEscola, tokenService } = await createContainer(env);
  const app = createApp({
    auth,
    escolas,
    servicosDaEscola,
    tokenService,
    corsOrigin: env.corsOrigin,
    trustProxy: env.trustProxy,
    logger: { error() {} },
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/** Chama a API; JSON vira objeto, o resto (CSV) volta como Buffer, com os cabeçalhos. */
async function chamar(metodo, caminho, { token, corpo, ip } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (ip) headers['X-Forwarded-For'] = ip;
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

async function logar(login, senha, ip = '10.1.0.1') {
  const { status, body } = await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login, senha }, ip });
  assert.equal(status, 200, JSON.stringify(body));
  return body.token;
}

describe('API EMMOO — gestão do dia a dia', () => {
  let coordenacao;
  let professor;
  let responsavel;
  const mes = dia(0).slice(0, 7);

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
    responsavel = await logar('mary@emmoo.com.br', 'emmoo123');
  });

  it('PUT /auth/senha — troca a própria senha; a sessão antiga cai e a nova vale', async () => {
    assert.equal((await chamar('PUT', '/auth/senha', { corpo: {} })).status, 401);
    const errada = await chamar('PUT', '/auth/senha', { token: professor, corpo: { senhaAtual: 'x', novaSenha: 'violao2026' } });
    assert.deepEqual([errada.status, errada.body.error.details[0].campo], [400, 'senhaAtual']);
    const trocada = await chamar('PUT', '/auth/senha', {
      token: professor,
      corpo: { senhaAtual: 'Luiz123', novaSenha: 'violao2026' },
    });
    assert.equal(trocada.status, 200);
    assert.equal((await chamar('GET', '/auth/me', { token: professor })).status, 401);
    professor = trocada.body.token;
    assert.equal((await chamar('GET', '/auth/me', { token: professor })).body.nome, 'Luiz');
    assert.ok(await logar('luiz', 'violao2026'));
  });

  it('esqueci e redefinir: sem e-mail configurado, orienta a pedir à coordenação; link inválido é 400', async () => {
    const esqueci = await chamar('POST', '/auth/esqueci', { corpo: { escola: 'emmoo', login: 'luiz' } });
    assert.deepEqual([esqueci.status, esqueci.body.error.code], [409, 'CONFLICT']);
    const redefinir = await chamar('POST', '/auth/redefinir', { corpo: { token: 'x'.repeat(43), novaSenha: 'nova-senha' } });
    assert.deepEqual([redefinir.status, redefinir.body.error.details[0].campo], [400, 'token']);
  });

  it('login: 5 senhas erradas bloqueiam a conta (429), sem afetar as outras; o endereço vem do proxy', async () => {
    const errar = (ip) => chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'mary@emmoo.com.br', senha: 'x' }, ip });
    for (let i = 0; i < 5; i += 1) assert.equal((await errar(`10.2.0.${i}`)).status, 401);
    const bloqueada = await errar('10.2.0.9');
    assert.deepEqual([bloqueada.status, bloqueada.body.error.code], [429, 'TOO_MANY_REQUESTS']);
    assert.match(bloqueada.body.error.message, /Tente novamente em 15 minutos/);
    assert.ok(await logar('admin', 'admin', '10.2.0.9'));

    // 30 erros do mesmo endereço, em contas diferentes, bloqueiam o endereço.
    for (let i = 0; i < 30; i += 1) {
      await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: `ninguem${i}`, senha: 'x' }, ip: '10.3.0.1' });
    }
    const doEndereco = await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'admin', senha: 'admin' }, ip: '10.3.0.1' });
    assert.equal(doEndereco.status, 429);
  });

  it('GET/PUT /escola — a coordenação cadastra o Pix e recebe um exemplo para conferir no banco', async () => {
    assert.equal((await chamar('GET', '/escola', { token: professor })).status, 403);
    const antes = await chamar('GET', '/escola', { token: coordenacao });
    assert.deepEqual([antes.status, antes.body.codigo, antes.body.pix.configurado], [200, 'emmoo', false]);
    const invalido = await chamar('PUT', '/escola', {
      token: coordenacao,
      corpo: { nome: 'Escola de Música EMMOO', pix: { tipo: 'cpf', chave: '123', cidade: 'Joinville' } },
    });
    assert.deepEqual([invalido.status, invalido.body.error.details[0].campo], [400, 'pix.chave']);
    const salvo = await chamar('PUT', '/escola', {
      token: coordenacao,
      corpo: { nome: 'Escola de Música EMMOO', pix: { tipo: 'telefone', chave: '(47) 99999-0001', cidade: 'Joinville' } },
    });
    assert.equal(salvo.status, 200);
    assert.deepEqual(
      [salvo.body.pix.chave, salvo.body.pix.recebedor, salvo.body.pix.cidade],
      ['+5547999990001', 'Escola de Musica EMMOO', 'Joinville'],
    );
    assert.match(salvo.body.pix.exemplo.qrCodeSvg, /^<svg/);
    assert.match(salvo.body.pix.exemplo.copiaECola, /^000201/);
  });

  it('mensalidades — ajuste, cancelamento, reabertura, Pix e recibo numerado', async () => {
    assert.equal((await chamar('POST', '/mensalidades/gerar', { token: coordenacao, corpo: { mes } })).status, 200);
    const { body: lista } = await chamar('GET', `/mensalidades?mes=${mes}`, { token: coordenacao });
    const daAna = lista.find((m) => m.aluno.nome === 'Ana Beatriz');
    const doPedro = lista.find((m) => m.aluno.nome === 'Pedro Henrique');

    assert.equal((await chamar('PATCH', `/mensalidades/${daAna.id}/valor`, { token: responsavel, corpo: { valor: 1 } })).status, 403);
    const ajustada = await chamar('PATCH', `/mensalidades/${daAna.id}/valor`, {
      token: coordenacao,
      corpo: { valor: 120, motivo: 'Desconto de irmãos' },
    });
    assert.deepEqual([ajustada.status, ajustada.body.valor, ajustada.body.valorOriginal], [200, 120, daAna.valor]);

    const pix = await chamar('GET', `/mensalidades/${daAna.id}/pix`, { token: responsavel });
    assert.equal(pix.status, 200);
    assert.ok(pix.body.copiaECola.includes('5406120.00'));
    assert.match(pix.body.qrCodeSvg, /^<svg/);
    assert.equal((await chamar('GET', `/mensalidades/${doPedro.id}/pix`, { token: responsavel })).status, 404);
    assert.equal((await chamar('GET', `/mensalidades/${daAna.id}/pix`, { token: professor })).status, 403);

    const semMotivo = await chamar('PATCH', `/mensalidades/${doPedro.id}/cancelar`, { token: coordenacao, corpo: {} });
    assert.deepEqual([semMotivo.status, semMotivo.body.error.details[0].campo], [400, 'motivo']);
    const cancelada = await chamar('PATCH', `/mensalidades/${doPedro.id}/cancelar`, {
      token: coordenacao,
      corpo: { motivo: 'Mês sem aulas' },
    });
    assert.deepEqual([cancelada.status, cancelada.body.status], [200, 'cancelada']);
    const paga = await chamar('PATCH', `/mensalidades/${doPedro.id}/pagamento`, {
      token: coordenacao,
      corpo: { dataPagamento: dia(0), formaPagamento: 'pix' },
    });
    assert.equal(paga.status, 409);
    const reaberta = await chamar('PATCH', `/mensalidades/${doPedro.id}/reabrir`, { token: coordenacao });
    assert.deepEqual([reaberta.status, reaberta.body.cancelamentoMotivo], [200, null]);

    const primeira = await chamar('PATCH', `/mensalidades/${daAna.id}/pagamento`, {
      token: coordenacao,
      corpo: { dataPagamento: dia(0), formaPagamento: 'pix' },
    });
    assert.equal(primeira.body.numeroRecibo, 1);
    assert.equal((await chamar('GET', `/mensalidades/${daAna.id}/pix`, { token: responsavel })).status, 409); // já paga
    const todas = await chamar('GET', '/mensalidades?mes=todos&alunoId=2', { token: coordenacao });
    assert.deepEqual(todas.body.map((m) => m.id), [doPedro.id]);
  });

  it('PATCH /alunos/:id/inativar — pode cancelar junto as cobranças em aberto do aluno', async () => {
    const inativado = await chamar('PATCH', '/alunos/2/inativar', { token: coordenacao, corpo: { cancelarMensalidades: true } });
    assert.deepEqual([inativado.status, inativado.body.status, inativado.body.mensalidadesCanceladas], [200, 'inativo', 1]);
    const { body } = await chamar('GET', '/mensalidades?mes=todos&alunoId=2', { token: coordenacao });
    assert.deepEqual(body.map((m) => [m.status, m.cancelamentoMotivo]), [['cancelada', 'Aluno inativado.']]);
    assert.equal((await chamar('PATCH', '/alunos/2/reativar', { token: coordenacao })).status, 200);
  });

  it('GET /relatorios/mensal/csv — planilhas de mensalidades e de presença para a contabilidade', async () => {
    const mensalidades = await chamar('GET', `/relatorios/mensal/csv?mes=${mes}&tipo=mensalidades`, { token: coordenacao });
    assert.equal(mensalidades.status, 200);
    assert.equal(mensalidades.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(mensalidades.headers.get('content-disposition'), `attachment; filename="mensalidades-${mes}.csv"`);
    const texto = mensalidades.body.toString('utf8');
    assert.equal(texto.charCodeAt(0), 0xfeff);
    const [cabecalho, ...linhas] = texto.slice(1).trim().split('\r\n');
    assert.match(cabecalho, /^Aluno;Responsável;Mês de referência;Vencimento;Valor \(R\$\)/);
    const ana = linhas.find((linha) => linha.startsWith('Ana Beatriz;'));
    assert.match(ana, /;120,00;/);
    assert.match(ana, /;Paga;/);
    assert.match(ana, /;000001;Desconto de irmãos$/);

    const presenca = await chamar('GET', `/relatorios/mensal/csv?mes=${mes}&tipo=presenca`, { token: coordenacao });
    assert.equal(presenca.headers.get('content-disposition'), `attachment; filename="presenca-${mes}.csv"`);
    assert.match(presenca.body.toString('utf8'), /Aluno;Aulas;Presenças;Faltas;Reposições;Presença \(%\)/);
    assert.equal((await chamar('GET', `/relatorios/mensal/csv?tipo=outra`, { token: coordenacao })).status, 400);
    assert.equal((await chamar('GET', `/relatorios/mensal/csv`, { token: professor })).status, 403);
  });

  it('feriados nacionais — lista os do ano e cadastra os escolhidos de uma vez', async () => {
    // Daqui a dois anos: nenhum já passou e nenhum cai nas datas que o teste da remarcação usa.
    const ano = Number(dia(0).slice(0, 4)) + 2;
    assert.equal((await chamar('GET', `/feriados/nacionais?ano=${ano}`, { token: professor })).status, 403);
    const lista = await chamar('GET', `/feriados/nacionais?ano=${ano}`, { token: coordenacao });
    assert.equal(lista.status, 200);
    assert.ok(lista.body.feriados.some((f) => f.descricao === 'Natal' && !f.jaCadastrado && !f.passado));
    const criados = await chamar('POST', '/feriados/nacionais', {
      token: coordenacao,
      corpo: { ano, datas: [`${ano}-01-01`, `${ano}-12-25`] },
    });
    assert.deepEqual([criados.status, criados.body.criados], [201, 2]);
    const depois = await chamar('GET', `/feriados/nacionais?ano=${ano}`, { token: coordenacao });
    assert.equal(depois.body.feriados.find((f) => f.descricao === 'Natal').jaCadastrado, true);
  });

  it('PATCH /aulas/:id/remarcar — a escola remarca; a família não', async () => {
    const { body: agenda } = await chamar('GET', `/aulas?inicio=${dia(2)}&fim=${dia(20)}`, { token: coordenacao });
    const aula = agenda.find((item) => item.aluno.nome === 'Pedro Henrique' && item.status === 'agendada');
    const novaData = (() => {
      const data = new Date(`${aula.data}T12:00:00`);
      data.setDate(data.getDate() + 1); // o dia seguinte, no mesmo horário
      return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    })();
    assert.equal((await chamar('PATCH', `/aulas/${aula.id}/remarcar`, { token: responsavel, corpo: {} })).status, 403);
    const remarcada = await chamar('PATCH', `/aulas/${aula.id}/remarcar`, {
      token: coordenacao,
      corpo: { data: novaData, hora: aula.hora },
    });
    assert.equal(remarcada.status, 200, JSON.stringify(remarcada.body));
    assert.deepEqual([remarcada.body.aula.data, remarcada.body.de.data], [novaData, aula.data]);
    const detalhe = await chamar('GET', `/aulas/${aula.id}`, { token: coordenacao });
    assert.equal(detalhe.body.remarcadaDe.dataHora, `${aula.data}T${aula.hora}`);
  });

  it('GET /indicadores — a coordenação vê os alunos para agendar', async () => {
    const { status, body } = await chamar('GET', '/indicadores', { token: coordenacao });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.alunosParaAgendar));
  });

  it('GET /escolas/configuracao — informa se a recuperação de senha por e-mail está disponível', async () => {
    const { body } = await chamar('GET', '/escolas/configuracao');
    assert.equal(body.recuperacaoDeSenha, false);
  });
});
