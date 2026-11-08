import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { iniciarRotinas } from '../../src/rotinas.js';

function criarLogger() {
  const linhas = { log: [], error: [] };
  return { linhas, log: (texto) => linhas.log.push(texto), error: (texto) => linhas.error.push(texto) };
}

describe('rotinas automáticas (RF10 e RF12)', () => {
  it('roda a rotina de cada escola ao iniciar; o erro de uma escola não para as outras', async () => {
    const logger = criarLogger();
    const chamadas = [];
    const resultados = {
      1: { criadas: 2, mensalidadesAtualizadas: 1, alertasRegistrados: 1, enviados: 1, falhas: 0 },
      3: { criadas: 0, mensalidadesAtualizadas: 0, alertasRegistrados: 0, enviados: 0, falhas: 0 },
    };
    const rotinas = iniciarRotinas({
      escolas: { list: async () => [{ id: 1, codigo: 'sol' }, { id: 2, codigo: 'lua' }, { id: 3, codigo: 'mar' }] },
      servicosDaEscola: (id) => ({
        mensalidades: {
          async rotina() {
            chamadas.push(id);
            if (id === 2) throw new Error('banco fora do ar');
            return resultados[id];
          },
        },
      }),
      logger,
    });
    await rotinas.primeira;
    rotinas.parar();
    assert.deepEqual(chamadas, [1, 2, 3]);
    assert.deepEqual(logger.linhas.log, [
      '[rotinas] sol: 2 mensalidade(s) gerada(s), 1 com situação atualizada, 1 alerta(s) registrado(s), 1 e-mail(s) enviado(s).',
    ]); // nada a dizer sobre a escola "mar"
    assert.deepEqual(logger.linhas.error, ['[rotinas] lua: banco fora do ar']);
  });

  it('não começa uma rodada enquanto a anterior não termina; falha ao listar escolas só vai para o log', async () => {
    const logger = criarLogger();
    let liberar;
    let rodadas = 0;
    const rotinas = iniciarRotinas({
      escolas: {
        list: async () => {
          rodadas += 1;
          if (rodadas === 1) await new Promise((resolve) => (liberar = resolve));
          if (rodadas === 2) throw new Error('sem conexão');
          return [];
        },
      },
      servicosDaEscola: () => assert.fail('não há escolas'),
      logger,
      intervaloMs: 60_000,
    });
    await rotinas.executar(); // a primeira ainda está rodando: ignora
    assert.equal(rodadas, 1);
    liberar();
    await rotinas.primeira;
    await rotinas.executar();
    rotinas.parar();
    assert.equal(rodadas, 2);
    assert.deepEqual(logger.linhas.error, ['[rotinas] sem conexão']);
    assert.deepEqual(logger.linhas.log, []);
  });

  it('registra falhas de envio no log', async () => {
    const logger = criarLogger();
    const rotinas = iniciarRotinas({
      escolas: { list: async () => [{ id: 1, codigo: 'sol' }] },
      servicosDaEscola: () => ({ mensalidades: { rotina: async () => ({ criadas: 0, falhas: 2 }) } }),
      logger,
    });
    await rotinas.primeira;
    rotinas.parar();
    assert.deepEqual(logger.linhas.log, ['[rotinas] sol: 2 envio(s) com falha.']);
  });
});
