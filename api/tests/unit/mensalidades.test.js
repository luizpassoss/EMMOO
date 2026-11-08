import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  alertaDevido,
  isMesReferencia,
  motivoParaNaoGerar,
  nomeDoMes,
  situacaoDaMensalidade,
  somarMeses,
  valorDaMensalidade,
  vencimentoDaMensalidade,
} from '../../src/domain/mensalidades.js';
import { createMensalidadeService } from '../../src/modules/mensalidades/mensalidade.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { valorPorExtenso } from '../../src/shared/extenso.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

describe('regras das mensalidades (RF10–RF12, RN07, RN08, RN13)', () => {
  it('mês de referência "AAAA-MM": validação, soma e nome por extenso', () => {
    assert.equal(isMesReferencia('2026-10'), true);
    assert.equal(isMesReferencia('2026-13'), false);
    assert.equal(isMesReferencia('2026-1'), false);
    assert.equal(isMesReferencia(202610), false);
    assert.equal(somarMeses('2026-11', 2), '2027-01');
    assert.equal(somarMeses('2026-01', -1), '2025-12');
    assert.equal(nomeDoMes('2026-10'), 'outubro de 2026');
    assert.equal(nomeDoMes('2027-03'), 'março de 2027');
  });

  it('vence no dia 10; gerada perto disso ou depois, vence 5 dias depois de gerada', () => {
    assert.equal(vencimentoDaMensalidade('2026-11', '2026-10-17'), '2026-11-10');
    assert.equal(vencimentoDaMensalidade('2026-10', '2026-10-01'), '2026-10-10');
    assert.equal(vencimentoDaMensalidade('2026-10', '2026-10-07'), '2026-10-12');
    assert.equal(vencimentoDaMensalidade('2026-10', '2026-10-28'), '2026-11-02');
  });

  it('RN13 — no mês da matrícula, valor proporcional às semanas restantes; depois, o do plano', () => {
    assert.equal(valorDaMensalidade(140, '2026-10-17', '2026-10'), 84); // 3 de 5 semanas
    assert.equal(valorDaMensalidade(140, '2026-10-01', '2026-10'), 140);
    assert.equal(valorDaMensalidade('140.00', '2026-09-20', '2026-10'), 140);
  });

  it('RN08 — só aluno ativo e já matriculado gera mensalidade', () => {
    assert.equal(motivoParaNaoGerar({ status: 'inativo' }, '2026-01-01', '2026-10'), 'Aluno inativo não gera mensalidade.');
    assert.equal(motivoParaNaoGerar({ status: 'ativo' }, '2026-11-02', '2026-10'), 'Matriculado depois deste mês.');
    assert.equal(motivoParaNaoGerar({ status: 'ativo' }, '2026-10-31', '2026-10'), null);
  });

  it('RN07 — paga, pendente até o dia do vencimento e atrasada depois', () => {
    const aberta = { vencimento: '2026-10-10', dataPagamento: null };
    assert.equal(situacaoDaMensalidade(aberta, '2026-10-10'), 'pendente');
    assert.equal(situacaoDaMensalidade(aberta, '2026-10-11'), 'atrasada');
    assert.equal(situacaoDaMensalidade({ ...aberta, dataPagamento: '2026-10-20' }, '2026-10-30'), 'paga');
  });

  it('RF12 — alerta de vencimento nos 3 dias antes; de atraso depois do vencimento', () => {
    const aberta = { vencimento: '2026-10-10', dataPagamento: null };
    assert.equal(alertaDevido(aberta, '2026-10-06'), null);
    assert.equal(alertaDevido(aberta, '2026-10-07'), 'vencimento');
    assert.equal(alertaDevido(aberta, '2026-10-10'), 'vencimento');
    assert.equal(alertaDevido(aberta, '2026-10-11'), 'atraso');
    assert.equal(alertaDevido({ ...aberta, dataPagamento: '2026-10-05' }, '2026-10-20'), null);
  });
});

describe('valor por extenso (recibo, RF15)', () => {
  it('escreve reais e centavos como num recibo', () => {
    assert.equal(valorPorExtenso(140), 'cento e quarenta reais');
    assert.equal(valorPorExtenso(100), 'cem reais');
    assert.equal(valorPorExtenso(1), 'um real');
    assert.equal(valorPorExtenso(0.01), 'um centavo');
    assert.equal(valorPorExtenso(0), 'zero reais');
    assert.equal(valorPorExtenso(84.5), 'oitenta e quatro reais e cinquenta centavos');
    assert.equal(valorPorExtenso(2005.5), 'dois mil e cinco reais e cinquenta centavos');
    assert.equal(valorPorExtenso(1100), 'mil e cem reais');
    assert.equal(valorPorExtenso(1150), 'mil cento e cinquenta reais');
    assert.equal(valorPorExtenso(17), 'dezessete reais');
    assert.equal(valorPorExtenso(1_500_000), 'um milhão e quinhentos mil reais');
    assert.equal(valorPorExtenso(1_000_000), 'um milhão de reais');
    assert.equal(valorPorExtenso(3_000_000.02), 'três milhões de reais e dois centavos');
  });
  it('recusa valor negativo, inválido ou grande demais', () => {
    assert.throws(() => valorPorExtenso(-1), RangeError);
    assert.throws(() => valorPorExtenso('abc'), RangeError);
    assert.throws(() => valorPorExtenso(1_000_000_000), RangeError);
  });
});

describe('MensalidadeService (RF10–RF12, RF15)', () => {
  // Seed: Ana (responsável Mary) e Pedro (sem responsável), ambos no plano de R$ 140,00.
  const COORDENACAO = { id: 1, papel: 'coordenacao' };
  const MARY = { id: 3, papel: 'responsavel' };
  let repos;
  let enviados;
  let recibos;
  let falharEnvio;
  const mailer = {
    configurado: true,
    async enviar(mensagem) {
      if (falharEnvio) throw new Error('SMTP fora do ar');
      enviados.push(mensagem);
    },
  };
  const documentos = {
    async gerarRecibo(dados) {
      recibos.push(dados);
      return Buffer.from('%PDF-recibo');
    },
  };
  const criar = ({ hoje = '2026-10-07', comMailer = mailer } = {}) =>
    createMensalidadeService({
      mensalidades: repos.mensalidades,
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
      alertas: repos.alertas,
      escola: async () => ({ nome: 'Escola de Música EMMOO' }),
      mailer: comMailer,
      documentos,
      hoje: () => hoje,
    });

  beforeEach(async () => {
    ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
    enviados = [];
    recibos = [];
    falharEnvio = false;
    // Ana matriculada em setembro (paga o mês cheio); Pedro em 05/10 (proporcional em outubro).
    await repos.alunos.update(1, { criadoEm: '2026-09-15T12:00:00.000Z' });
    await repos.alunos.update(2, { criadoEm: '2026-10-05T12:00:00.000Z' });
  });

  it('RF10 — gera as do mês para os alunos ativos, com pro rata na matrícula, sem duplicar', async () => {
    const resultado = await criar().gerar({ mes: '2026-10' });
    assert.deepEqual(resultado, { mes: '2026-10', criadas: 2, jaExistiam: 0, ignorados: [] });
    const lista = await criar().listar({}, COORDENACAO);
    assert.deepEqual(
      lista.map((m) => [m.aluno.nome, m.valor, m.vencimento, m.status, m.plano.nome]),
      [
        ['Ana Beatriz', 140, '2026-10-12', 'pendente', 'Particular · 1 aula por semana'],
        ['Pedro Henrique', 112, '2026-10-12', 'pendente', 'Particular · 1 aula por semana'], // 4 de 5 semanas
      ],
    );
    assert.equal(lista[0].responsavel.nome, 'Mary');
    assert.equal(lista[1].responsavel, null);
    assert.deepEqual(await criar().gerar({ mes: '2026-10' }), { mes: '2026-10', criadas: 0, jaExistiam: 2, ignorados: [] });
  });

  it('RN08 — aluno inativo não gera; matriculado depois do mês aparece como ignorado', async () => {
    await repos.alunos.update(2, { status: 'inativo' });
    await repos.alunos.update(1, { criadoEm: '2026-12-01T12:00:00.000Z' });
    const resultado = await criar().gerar({ mes: '2026-11' });
    assert.equal(resultado.criadas, 0);
    assert.deepEqual(resultado.ignorados, [{ aluno: { id: 1, nome: 'Ana Beatriz' }, motivo: 'Matriculado depois deste mês.' }]);
  });

  it('aluno com plano que não existe mais fica de fora, com o motivo', async () => {
    await repos.alunos.update(2, { planoId: 999 });
    const resultado = await criar().gerar({ mes: '2026-10' });
    assert.equal(resultado.criadas, 1);
    assert.deepEqual(resultado.ignorados, [{ aluno: { id: 2, nome: 'Pedro Henrique' }, motivo: 'Plano não encontrado.' }]);
  });

  it('gera só o mês atual ou até dois meses à frente', async () => {
    for (const mes of ['2026-09', '2027-01', 'outubro', undefined]) {
      await assert.rejects(criar().gerar({ mes }), ValidationError);
    }
    assert.equal((await criar().gerar({ mes: '2026-12' })).criadas, 2);
  });

  it('lista por mês e situação (coordenação); o responsável vê só as dos dependentes', async () => {
    await criar().gerar({ mes: '2026-10' });
    await criar().gerar({ mes: '2026-11' });
    assert.equal((await criar().listar({ mes: '2026-11' }, COORDENACAO)).length, 2);
    assert.equal((await criar().listar({ mes: '2026-12' }, COORDENACAO)).length, 0);
    assert.deepEqual((await criar().listar({ alunoId: '2' }, COORDENACAO)).map((m) => m.aluno.id), [2]);
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    assert.deepEqual((await criar().listar({ status: 'paga' }, COORDENACAO)).map((m) => m.id), [1]);
    assert.deepEqual((await criar({ hoje: '2026-10-13' }).listar({ status: 'atrasada' }, COORDENACAO)).map((m) => m.id), [2]);
    await assert.rejects(criar().listar({ status: 'vencida' }, COORDENACAO), ValidationError);
    await assert.rejects(criar().listar({ mes: '10/2026' }, COORDENACAO), ValidationError);

    const daMary = await criar().listar({}, MARY);
    assert.deepEqual(daMary.map((m) => [m.aluno.nome, m.mesReferencia]), [['Ana Beatriz', '2026-11'], ['Ana Beatriz', '2026-10']]);
    const semDependentes = await repos.usuarios.create({ nome: 'Rui', email: 'rui@x.com', senhaHash: 'h', papel: 'responsavel' });
    assert.deepEqual(await criar().listar({}, { id: semDependentes.id, papel: 'responsavel' }), []);
  });

  it('RF11 — baixa com data (até hoje) e forma de pagamento; não paga duas vezes', async () => {
    await criar().gerar({ mes: '2026-10' });
    const paga = await criar().registrarPagamento('1', { dataPagamento: '2026-10-06', formaPagamento: 'dinheiro' });
    assert.deepEqual(
      [paga.status, paga.dataPagamento, paga.formaPagamento, paga.formaPagamentoNome],
      ['paga', '2026-10-06', 'dinheiro', 'Dinheiro'],
    );
    // A escola recebe só por Pix ou em dinheiro.
    for (const forma of ['cartao', 'transferencia', 'boleto']) {
      await assert.rejects(criar().registrarPagamento(2, { dataPagamento: '2026-10-07', formaPagamento: forma }), (erro) => {
        assert.deepEqual(erro.details, [{ campo: 'formaPagamento', mensagem: 'Escolha a forma de pagamento: Pix ou dinheiro.' }]);
        return true;
      });
    }
    await assert.rejects(criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' }), {
      name: ConflictError.name,
      message: 'Esta mensalidade já está paga.',
    });
    await assert.rejects(criar().registrarPagamento(2, { dataPagamento: '2026-10-08', formaPagamento: 'pix' }), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'dataPagamento', mensagem: 'A data do pagamento não pode ser futura.' }]);
      return true;
    });
    await assert.rejects(criar().registrarPagamento(2, { formaPagamento: 'cheque' }), (erro) => {
      assert.deepEqual(erro.details.map((d) => d.campo), ['dataPagamento', 'formaPagamento']);
      return true;
    });
    await assert.rejects(criar().registrarPagamento(2, { dataPagamento: '2026-10-07', formaPagamento: 'toString' }), ValidationError);
    await assert.rejects(criar().registrarPagamento(999, { dataPagamento: '2026-10-07', formaPagamento: 'pix' }), NotFoundError);
    await assert.rejects(criar().registrarPagamento('x', {}), ValidationError);
  });

  it('a lista do mês começa pelo que pede ação: atrasadas, pendentes e, por fim, as pagas', async () => {
    await criar().gerar({ mes: '2026-10' });
    const zeca = await repos.alunos.create({ nome: 'Zeca', status: 'ativo', planoId: 1, usuarioRespId: null });
    await repos.mensalidades.create({ alunoId: zeca.id, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-20' });
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' }); // Ana
    const ordem = (await criar({ hoje: '2026-10-13' }).listar({}, COORDENACAO)).map((m) => [m.aluno.nome, m.status]);
    assert.deepEqual(ordem, [
      ['Pedro Henrique', 'atrasada'],
      ['Zeca', 'pendente'],
      ['Ana Beatriz', 'paga'],
    ]);
  });

  it('RF11 — histórico de pagamentos: do mais recente ao mais antigo, com totais por forma', async () => {
    await criar().gerar({ mes: '2026-10' });
    await criar().gerar({ mes: '2026-11' });
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-05', formaPagamento: 'pix' }); // Ana, outubro
    await criar().registrarPagamento(3, { dataPagamento: '2026-10-07', formaPagamento: 'dinheiro' }); // Ana, novembro
    await criar().registrarPagamento(2, { dataPagamento: '2026-10-06', formaPagamento: 'pix' }); // Pedro, outubro

    const todos = await criar().pagamentos({}, COORDENACAO);
    assert.deepEqual(
      todos.pagamentos.map((m) => [m.aluno.nome, m.mesReferencia, m.dataPagamento, m.formaPagamentoNome]),
      [
        ['Ana Beatriz', '2026-11', '2026-10-07', 'Dinheiro'],
        ['Pedro Henrique', '2026-10', '2026-10-06', 'Pix'],
        ['Ana Beatriz', '2026-10', '2026-10-05', 'Pix'],
      ],
    );
    assert.deepEqual(todos.totais, {
      quantidade: 3,
      valor: 392, // 140 + 140 (Ana) + 112 (Pedro, proporcional em outubro)
      porForma: { pix: { quantidade: 2, valor: 252 }, dinheiro: { quantidade: 1, valor: 140 } },
    });
    assert.deepEqual((await criar().pagamentos({ alunoId: '2' }, COORDENACAO)).pagamentos.map((m) => m.id), [2]);
    assert.deepEqual((await criar().pagamentos({}, MARY)).pagamentos.map((m) => m.aluno.nome), ['Ana Beatriz', 'Ana Beatriz']);
    assert.deepEqual((await criar().pagamentos({ alunoId: 2 }, MARY)).pagamentos, []); // não é dependente da Mary
    const rui = await repos.usuarios.create({ nome: 'Rui', email: 'rui@x.com', senhaHash: 'h', papel: 'responsavel' });
    assert.deepEqual(await criar().pagamentos({}, { id: rui.id, papel: 'responsavel' }), {
      pagamentos: [],
      totais: { quantidade: 0, valor: 0, porForma: { pix: { quantidade: 0, valor: 0 }, dinheiro: { quantidade: 0, valor: 0 } } },
    });
    await assert.rejects(criar().pagamentos({ alunoId: 'x' }, COORDENACAO), ValidationError);
  });

  it('pagamento registrado numa forma aceita antes continua com o nome certo', async () => {
    await criar().gerar({ mes: '2026-10' });
    await repos.mensalidades.update(1, { status: 'paga', dataPagamento: '2026-10-05', formaPagamento: 'transferencia' });
    const [antiga] = (await criar().pagamentos({}, COORDENACAO)).pagamentos;
    assert.equal(antiga.formaPagamentoNome, 'Transferência bancária');
  });

  it('desfaz a baixa: volta a pendente, ou atrasada se já venceu', async () => {
    await criar().gerar({ mes: '2026-10' });
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    const aberta = await criar().desfazerPagamento(1);
    assert.deepEqual([aberta.status, aberta.dataPagamento, aberta.formaPagamento], ['pendente', null, null]);
    await assert.rejects(criar().desfazerPagamento(1), { name: ConflictError.name, message: 'Esta mensalidade não está paga.' });

    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    assert.equal((await criar({ hoje: '2026-10-20' }).desfazerPagamento(1)).status, 'atrasada');
  });

  it('RF15 — recibo só da mensalidade paga, em nome do responsável, com valor por extenso', async () => {
    await criar().gerar({ mes: '2026-10' });
    await assert.rejects(criar().recibo(1, COORDENACAO), {
      name: ConflictError.name,
      message: 'O recibo fica disponível depois que o pagamento é registrado.',
    });
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-06', formaPagamento: 'pix' });
    const { arquivo, conteudo } = await criar().recibo(1, MARY);
    assert.equal(arquivo, 'recibo-2026-10-ana-beatriz.pdf');
    assert.equal(conteudo.toString(), '%PDF-recibo');
    assert.deepEqual(recibos[0], {
      escola: 'Escola de Música EMMOO',
      numero: 1,
      pagador: 'Mary',
      aluno: 'Ana Beatriz',
      instrumento: 'Violino',
      plano: 'Particular · 1 aula por semana',
      mesReferencia: 'outubro de 2026',
      valor: 140,
      valorExtenso: 'cento e quarenta reais',
      dataPagamento: '2026-10-06',
      formaPagamento: 'Pix',
      emitidoEm: '2026-10-07',
    });

    // Sem responsável, o pagador é o próprio aluno; e o responsável não vê recibo de quem não é dependente.
    await criar().registrarPagamento(2, { dataPagamento: '2026-10-06', formaPagamento: 'dinheiro' });
    assert.equal((await criar().recibo(2, COORDENACAO)).arquivo, 'recibo-2026-10-pedro-henrique.pdf');
    assert.equal(recibos[1].pagador, 'Pedro Henrique');
    await assert.rejects(criar().recibo(2, MARY), NotFoundError);
  });

  it('RF12 — alerta de vencimento e depois de atraso, por e-mail ao responsável, uma vez cada', async () => {
    await criar().gerar({ mes: '2026-10' }); // vencem em 12/10

    assert.deepEqual(await criar({ hoje: '2026-10-08' }).processarAlertas(), {
      mensalidadesAtualizadas: 0,
      alertasRegistrados: 0,
      enviados: 0,
      falhas: 0,
    });
    // Pedro não tem responsável: o alerta dele aparece só no sistema.
    assert.deepEqual(await criar({ hoje: '2026-10-09' }).processarAlertas(), {
      mensalidadesAtualizadas: 0,
      alertasRegistrados: 1,
      enviados: 1,
      falhas: 0,
    });
    assert.equal(enviados[0].para, 'mary@emmoo.com.br');
    assert.equal(enviados[0].assunto, 'Mensalidade de outubro de 2026 vence em 12/10/2026');
    assert.match(enviados[0].texto, /^Olá, Mary\./);
    assert.match(enviados[0].texto, /Ana Beatriz referente a outubro de 2026, no valor de R\$\s140,00, vence em 12\/10\/2026/);
    assert.equal((await criar({ hoje: '2026-10-10' }).processarAlertas()).enviados, 0); // não repete

    const noAtraso = await criar({ hoje: '2026-10-13' }).processarAlertas();
    assert.deepEqual(noAtraso, { mensalidadesAtualizadas: 2, alertasRegistrados: 1, enviados: 1, falhas: 0 });
    assert.equal(enviados[1].assunto, 'Mensalidade de outubro de 2026 em atraso');
    assert.match(enviados[1].texto, /venceu em 12\/10\/2026 e ainda não consta como paga/);
    assert.deepEqual((await repos.mensalidades.list()).map((m) => m.status), ['atrasada', 'atrasada']);

    const resumo = await criar({ hoje: '2026-10-13' }).resumoDeAlertas();
    assert.deepEqual(resumo, {
      atrasadas: { quantidade: 2, valor: 252 },
      vencendo: { quantidade: 0, valor: 0 },
      email: { configurado: true, pendentes: 0, enviados: 2, ultimoErro: null },
    });
  });

  it('RF12 — envio que falha fica pendente para reenvio; a rotina desiste depois de 5 tentativas', async () => {
    await criar().gerar({ mes: '2026-10' });
    falharEnvio = true;
    const servico = criar({ hoje: '2026-10-10' });
    assert.deepEqual(await servico.processarAlertas(), { mensalidadesAtualizadas: 0, alertasRegistrados: 1, enviados: 0, falhas: 1 });
    const [alerta] = await repos.alertas.list();
    assert.deepEqual([alerta.status, alerta.tentativas, alerta.ultimoErro], ['pendente', 1, 'SMTP fora do ar']);
    assert.deepEqual((await servico.resumoDeAlertas()).email, { configurado: true, pendentes: 1, enviados: 0, ultimoErro: 'SMTP fora do ar' });
    assert.deepEqual((await servico.resumoDeAlertas()).vencendo, { quantidade: 2, valor: 252 });

    for (let i = 0; i < 4; i += 1) await servico.processarAlertas();
    assert.equal((await repos.alertas.list())[0].tentativas, 5);
    assert.equal((await servico.processarAlertas()).falhas, 0); // automático: parou de tentar

    falharEnvio = false;
    const manual = await servico.enviarAlertas(); // a coordenação pede o reenvio
    assert.equal(manual.enviados, 1);
    assert.deepEqual(manual.resumo.email, { configurado: true, pendentes: 0, enviados: 1, ultimoErro: null });
    const [enviado] = await repos.alertas.list();
    assert.deepEqual([enviado.status, enviado.tentativas, enviado.ultimoErro], ['enviado', 6, null]);
    assert.ok(enviado.enviadoEm);
  });

  it('sem SMTP, o alerta é registrado e fica pendente; pagou antes do envio, não envia', async () => {
    const semEmail = { configurado: false, enviar: async () => assert.fail('não deveria enviar') };
    await criar().gerar({ mes: '2026-10' });
    const servico = criar({ hoje: '2026-10-10', comMailer: semEmail });
    assert.deepEqual(await servico.processarAlertas(), { mensalidadesAtualizadas: 0, alertasRegistrados: 1, enviados: 0, falhas: 0 });
    assert.deepEqual((await servico.resumoDeAlertas()).email, { configurado: false, pendentes: 1, enviados: 0, ultimoErro: null });

    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    assert.equal((await criar({ hoje: '2026-10-10' }).processarAlertas()).enviados, 0);
    assert.equal(enviados.length, 0);
    assert.equal((await servico.resumoDeAlertas()).email.pendentes, 0);
  });

  it('não registra alerta para responsável sem acesso ativo', async () => {
    await repos.usuarios.update(3, { ativo: false });
    await criar().gerar({ mes: '2026-10' });
    assert.equal((await criar({ hoje: '2026-10-13' }).processarAlertas()).alertasRegistrados, 0);
  });

  it('rotina automática: gera as do mês atual e processa os alertas', async () => {
    const resultado = await criar({ hoje: '2026-10-10' }).rotina();
    assert.deepEqual(resultado, {
      mes: '2026-10',
      criadas: 2,
      jaExistiam: 0,
      ignorados: [],
      mensalidadesAtualizadas: 0,
      alertasRegistrados: 0, // vence em 15/10: ainda não é hora do alerta
      enviados: 0,
      falhas: 0,
    });
    assert.deepEqual((await repos.mensalidades.list()).map((m) => m.vencimento), ['2026-10-15', '2026-10-15']);
  });
});
