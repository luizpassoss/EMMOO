import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testarEmail } from '../../scripts/testar-email.js';

function mailerFake({ configurado = true, falhaNoLogin = null } = {}) {
  const enviados = [];
  return {
    enviados,
    configurado,
    async verificar() {
      if (falhaNoLogin) throw new Error(falhaNoLogin);
    },
    async enviar(mensagem) {
      enviados.push(mensagem);
    },
  };
}
const QUANDO = new Date('2026-11-17T18:30:00Z');

describe('npm run email:testar — confere o e-mail da API', () => {
  it('com login aceito, manda o teste e diz para quem foi', async () => {
    const mailer = mailerFake();
    const saida = await testarEmail(mailer, { para: 'luiz@exemplo.com', remetente: 'EMMOO <e@x.com>', escola: 'Escola de Música EMMOO', agora: QUANDO });
    assert.match(saida, /teste enviado para luiz@exemplo.com/);
    assert.equal(mailer.enviados.length, 1);
    assert.equal(mailer.enviados[0].assunto, 'Teste de e-mail — Escola de Música EMMOO');
    assert.match(mailer.enviados[0].texto, /17\/11\/2026, 15:30:00/); // horário de Brasília
  });

  it('diz onde falhou: destinatário, configuração ou login', async () => {
    await assert.rejects(testarEmail(mailerFake(), { para: 'sem-arroba' }), /--para alguem@exemplo.com/);
    await assert.rejects(testarEmail(mailerFake({ configurado: false }), { para: 'a@b.com' }), /SMTP_URL não está definido/);
    const recusado = mailerFake({ falhaNoLogin: 'Invalid login: 535' });
    await assert.rejects(testarEmail(recusado, { para: 'a@b.com' }), /recusou a conexão ou o login \(Invalid login: 535\)/);
    assert.equal(recusado.enviados.length, 0); // sem login, nada é enviado
  });
});
