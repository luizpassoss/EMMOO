import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMailer } from '../../src/infra/email/mailer.js';
import { formatarMoeda, gerarRecibo, gerarRelatorioMensal } from '../../src/infra/pdf/documentos.js';

/** Quantas páginas o PDF tem (a árvore de páginas do pdfkit não é comprimida). */
const paginas = (pdf) => Number(/\/Type \/Pages\s*\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);

describe('documentos em PDF (RF15)', () => {
  it('recibo: um PDF de uma página', async () => {
    const pdf = await gerarRecibo({
      escola: 'Escola de Música EMMOO',
      numero: 12,
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
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(paginas(pdf), 1);
  });

  it('relatório mensal: quebra em páginas quando a lista é longa', async () => {
    const dados = (quantidade) => ({
      escola: 'Escola de Música EMMOO',
      mes: '2026-10',
      mesNome: 'outubro de 2026',
      geradoEm: '17/10/2026 às 10:00',
      financeiro: { previsto: 280, recebido: 140, emAberto: 140, atrasado: 0, quantidade: { paga: 1, pendente: 1, atrasada: 0 } },
      mensalidades: Array.from({ length: quantidade }, (_, i) => ({
        aluno: `Aluno com um nome bem comprido para testar o corte ${i + 1}`,
        vencimento: '2026-10-10',
        valor: 140,
        situacao: i % 2 ? 'Paga' : 'Pendente',
        dataPagamento: i % 2 ? '2026-10-05' : null,
        formaPagamento: i % 2 ? 'Transferência bancária' : null,
      })),
      presenca: {
        percentual: quantidade ? 75 : null,
        porAluno: Array.from({ length: quantidade }, (_, i) => ({
          aluno: `Aluno ${i + 1}`,
          aulas: 4,
          presencas: 3,
          faltas: 1,
          reposicoes: 1,
          percentual: 75,
        })),
      },
    });
    const curto = await gerarRelatorioMensal(dados(2));
    assert.equal(curto.subarray(0, 5).toString(), '%PDF-');
    assert.equal(paginas(curto), 1);
    assert.ok(paginas(await gerarRelatorioMensal(dados(60))) >= 3);
    assert.equal(paginas(await gerarRelatorioMensal(dados(0))), 1); // mês sem nada: ainda é um relatório
  });

  it('formata moeda em reais', () => {
    assert.match(formatarMoeda(1234.5), /^R\$\s1\.234,50$/);
    assert.match(formatarMoeda('84'), /^R\$\s84,00$/);
  });
});

describe('e-mail dos alertas (RF12)', () => {
  it('sem SMTP_URL: não está configurado e o envio falha dizendo o que fazer', async () => {
    const mailer = createMailer({ smtpUrl: null, remetente: 'EMMOO <x@y.com>' });
    assert.equal(mailer.configurado, false);
    await assert.rejects(mailer.enviar({ para: 'a@b.com', assunto: 'x', texto: 'y' }), {
      message: 'Envio de e-mail não configurado (defina SMTP_URL na API).',
    });
  });

  it('com SMTP_URL: cria o transporte uma vez e envia do remetente configurado', async () => {
    const enviados = [];
    let transportes = 0;
    const mailer = createMailer({
      smtpUrl: 'smtps://u:s@smtp.exemplo.com:465',
      remetente: 'Escola <oi@escola.com>',
      criarTransporte: async (url) => {
        transportes += 1;
        assert.equal(url, 'smtps://u:s@smtp.exemplo.com:465');
        return { sendMail: async (mensagem) => enviados.push(mensagem) };
      },
    });
    assert.equal(mailer.configurado, true);
    await mailer.enviar({ para: 'mary@emmoo.com.br', assunto: 'Mensalidade', texto: 'Olá' });
    await mailer.enviar({ para: 'rui@x.com', assunto: 'Mensalidade', texto: 'Olá' });
    assert.equal(transportes, 1);
    assert.deepEqual(enviados[0], { from: 'Escola <oi@escola.com>', to: 'mary@emmoo.com.br', subject: 'Mensalidade', text: 'Olá' });
  });

  it('usa o nodemailer quando nenhum transporte é informado', async () => {
    // Porta fechada no próprio computador: a conexão é recusada na hora, sem rede externa.
    const mailer = createMailer({ smtpUrl: 'smtp://127.0.0.1:1', remetente: 'EMMOO <x@y.com>' });
    await assert.rejects(mailer.enviar({ para: 'a@b.com', assunto: 'x', texto: 'y' }));
  });
});
