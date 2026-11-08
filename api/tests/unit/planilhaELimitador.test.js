import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataCsv, gerarCsv, numeroCsv } from '../../src/shared/csv.js';
import { criarLimitador, mensagemDeEspera } from '../../src/shared/limitador.js';

describe('planilha CSV (Excel em português)', () => {
  it('começa com a marca BOM, separa por ";" e quebra a linha como no Windows', () => {
    const csv = gerarCsv(['Aluno', 'Valor (R$)'], [['Ana', numeroCsv(140)], ['Pedro', numeroCsv(112.5)]]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv.slice(1), 'Aluno;Valor (R$)\r\nAna;140,00\r\nPedro;112,50\r\n');
  });

  it('põe entre aspas o que tem ";", aspas ou quebra de linha; vazio e nulo viram célula vazia', () => {
    const csv = gerarCsv(['a', 'b', 'c', 'd'], [['Silva; Souza', 'diz "oi"', 'linha 1\nlinha 2', null]]);
    assert.equal(csv.slice(1).split('\r\n')[1], '"Silva; Souza";"diz ""oi""";"linha 1\nlinha 2";');
  });

  it('texto que começa como fórmula ganha um apóstrofo (o Excel não o executa)', () => {
    const linha = gerarCsv(['x'], [['=HYPERLINK("http://mal")'], ['+1'], ['-2'], ['@SOMA(A1)'], ['Ana']]).slice(1).split('\r\n');
    assert.deepEqual(linha.slice(1, 6), ['"\'=HYPERLINK(""http://mal"")"', "'+1", "'-2", "'@SOMA(A1)", 'Ana']);
  });

  it('números com vírgula decimal e datas dd/mm/aaaa', () => {
    assert.equal(numeroCsv(1234.5), '1234,50');
    assert.equal(numeroCsv('99'), '99,00');
    assert.equal(dataCsv('2026-10-05'), '05/10/2026');
    assert.equal(dataCsv(null), '');
  });
});

describe('limite de tentativas', () => {
  it('bloqueia depois do máximo dentro da janela e libera quando a mais antiga sai dela', () => {
    let agora = 0;
    const limitador = criarLimitador({ maximo: 3, janelaMs: 1000, agora: () => agora });
    for (const instante of [0, 100, 200]) {
      agora = instante;
      assert.equal(limitador.esperaMs('conta'), 0);
      limitador.registrar('conta');
    }
    agora = 300;
    assert.equal(limitador.esperaMs('conta'), 700); // a de 0 ms sai da janela em 1000 ms
    assert.equal(limitador.esperaMs('outra'), 0); // cada chave conta a sua
    agora = 1000;
    assert.equal(limitador.esperaMs('conta'), 0);
    limitador.registrar('conta');
    agora = 1050;
    assert.equal(limitador.esperaMs('conta'), 50); // a de 100 ms sai da janela em 1100 ms
    limitador.limpar('conta');
    assert.equal(limitador.esperaMs('conta'), 0);
  });

  it('esquece as chaves antigas quando são muitas (a memória não cresce sem limite)', () => {
    let agora = 0;
    const limitador = criarLimitador({ maximo: 1, janelaMs: 10, agora: () => agora });
    for (let i = 0; i < 1000; i += 1) limitador.registrar(`ip-${i}`);
    agora = 100;
    limitador.registrar('novo'); // passa pelas 1000 antigas e as descarta
    assert.equal(limitador.esperaMs('ip-0'), 0);
    assert.ok(limitador.esperaMs('novo') > 0);
  });

  it('diz quanto esperar, em minutos (para cima)', () => {
    assert.equal(mensagemDeEspera(1), 'Muitas tentativas. Tente novamente em 1 minuto.');
    assert.equal(mensagemDeEspera(60001), 'Muitas tentativas. Tente novamente em 2 minutos.');
    assert.equal(mensagemDeEspera(15 * 60000), 'Muitas tentativas. Tente novamente em 15 minutos.');
  });
});
