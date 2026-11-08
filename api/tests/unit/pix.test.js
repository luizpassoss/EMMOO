import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cnpjValido, cpfValido, crc16, gerarPixCopiaECola, normalizarChavePix, textoPix } from '../../src/domain/pix.js';
import { validarDadosDaEscola } from '../../src/modules/escolas/dadosEscola.validator.js';

// Exemplo oficial do manual do BR Code (Banco Central): Pix estático, sem valor.
const EXEMPLO_BCB =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

describe('Pix copia e cola (BR Code)', () => {
  it('CRC16-CCITT: o valor de referência e o do exemplo do Banco Central', () => {
    assert.equal(crc16('123456789'), '29B1');
    assert.equal(crc16(EXEMPLO_BCB.slice(0, -4)), '1D3D');
  });

  it('gera exatamente o exemplo do Banco Central', () => {
    const codigo = gerarPixCopiaECola({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      recebedor: 'Fulano de Tal',
      cidade: 'BRASILIA',
    });
    assert.equal(codigo, EXEMPLO_BCB);
  });

  it('com valor (2 casas) e descrição; nome e cidade sem acento e no tamanho do padrão', () => {
    const codigo = gerarPixCopiaECola({
      chave: '+5547999990001',
      recebedor: 'Escola de Música São João do Itaperiú',
      cidade: 'Balneário Camboriú',
      valor: 140,
      descricao: 'Mensalidade 10 2026 Ana',
    });
    assert.ok(codigo.includes('0014br.gov.bcb.pix0114+5547999990001'));
    assert.ok(codigo.includes('0223Mensalidade 10 2026 Ana'));
    assert.ok(codigo.includes('5406140.00'));
    assert.ok(codigo.includes('5925Escola de Musica Sao Joao6015Balneario Cambo'));
    assert.equal(codigo.slice(-8, -4), '6304');
    assert.equal(codigo.slice(-4), crc16(codigo.slice(0, -4)));
    // O campo da conta (26) declara o próprio tamanho: confere com o conteúdo.
    const conta = codigo.slice(codigo.indexOf('26') + 4, codigo.indexOf('52040000'));
    assert.equal(Number(codigo.slice(codigo.indexOf('26') + 2, codigo.indexOf('26') + 4)), conta.length);
  });

  it('a descrição encurta ou sai para caber com a chave no campo da conta (até 99)', () => {
    const chaveLonga = `${'a'.repeat(60)}@escola.com.br`; // 74 caracteres
    const codigo = gerarPixCopiaECola({ chave: chaveLonga, recebedor: 'EMMOO', cidade: 'Joinville', descricao: 'Mensalidade 10 2026 Ana Beatriz' });
    const tamanho = Number(codigo.slice(codigo.indexOf('0014br') - 2, codigo.indexOf('0014br')));
    assert.ok(tamanho <= 99);
    assert.ok(!codigo.includes('Mensalidade 10 2026 Ana Beatriz'));
    const semEspaco = gerarPixCopiaECola({ chave: `${'b'.repeat(64)}@escola.com.br`, recebedor: 'EMMOO', cidade: 'Joinville', descricao: 'Mensalidade' });
    assert.ok(!semEspaco.includes('Mensalidade')); // sobrariam menos de 8 letras: fica de fora
    const semValor = gerarPixCopiaECola({ chave: 'x@y.com', recebedor: 'EMMOO', cidade: 'Joinville', valor: 0 });
    assert.ok(!semValor.includes('5404'));
  });

  it('texto do Pix: sem acentos nem símbolos, espaços simples, no tamanho máximo', () => {
    assert.equal(textoPix('  Conceição  & Cia. ', 25), 'Conceicao Cia');
    assert.equal(textoPix(null, 10), '');
    assert.equal(textoPix('Florianópolis', 15), 'Florianopolis');
  });
});

describe('chave Pix da escola', () => {
  it('CPF e CNPJ com dígito verificador', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('529.982.247-24'), false);
    assert.equal(cpfValido('111.111.111-11'), false);
    assert.equal(cpfValido('5299822472'), false);
    assert.equal(cnpjValido('11.222.333/0001-81'), true);
    assert.equal(cnpjValido('11.222.333/0001-80'), false);
    assert.equal(cnpjValido('00.000.000/0000-00'), false);
  });

  it('normaliza cada tipo no formato do Pix', () => {
    assert.deepEqual(normalizarChavePix('cpf', '529.982.247-25'), { chave: '52998224725' });
    assert.deepEqual(normalizarChavePix('cnpj', '11.222.333/0001-81'), { chave: '11222333000181' });
    assert.deepEqual(normalizarChavePix('telefone', '(47) 99999-0001'), { chave: '+5547999990001' });
    assert.deepEqual(normalizarChavePix('telefone', '+55 47 3333-0001'), { chave: '+554733330001' });
    assert.deepEqual(normalizarChavePix('email', ' Financeiro@EMMOO.com.br '), { chave: 'financeiro@emmoo.com.br' });
    assert.deepEqual(normalizarChavePix('aleatoria', '123E4567-E89B-12D3-A456-426614174000'), {
      chave: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('explica o erro de cada tipo', () => {
    assert.match(normalizarChavePix('cpf', '123').erro, /CPF inválido/);
    assert.match(normalizarChavePix('cnpj', '123').erro, /CNPJ inválido/);
    assert.match(normalizarChavePix('telefone', '9999').erro, /celular com DDD/);
    assert.match(normalizarChavePix('telefone', '(04) 99999-0001').erro, /celular com DDD/);
    assert.match(normalizarChavePix('email', 'sem-arroba').erro, /e-mail válido/);
    assert.match(normalizarChavePix('aleatoria', 'abc').erro, /36 caracteres/);
    assert.match(normalizarChavePix('boleto', 'x').erro, /tipo da chave/);
  });
});

describe('dados da escola (nome e Pix)', () => {
  it('sem tipo de chave, remove o Pix; com ela, guarda já no formato do código', () => {
    assert.deepEqual(validarDadosDaEscola({ nome: ' Escola  EMMOO ', pix: null }).dados, {
      nome: 'Escola EMMOO',
      pixTipo: null,
      pixChave: null,
      pixRecebedor: null,
      pixCidade: null,
    });
    assert.equal(validarDadosDaEscola({ nome: 'Escola EMMOO', pix: { tipo: '' } }).dados.pixChave, null);
    assert.deepEqual(
      validarDadosDaEscola({ nome: 'Escola de Música EMMOO', pix: { tipo: 'cnpj', chave: '11.222.333/0001-81', cidade: 'Joinville' } })
        .dados,
      {
        nome: 'Escola de Música EMMOO',
        pixTipo: 'cnpj',
        pixChave: '11222333000181',
        pixRecebedor: 'Escola de Musica EMMOO', // sem recebedor: o nome da escola
        pixCidade: 'Joinville',
      },
    );
  });

  it('aponta nome, tipo, chave, recebedor e cidade inválidos', () => {
    const campos = (input) => validarDadosDaEscola(input).erros.map((erro) => erro.campo);
    assert.deepEqual(campos({ nome: 'x' }), ['nome']);
    assert.deepEqual(campos({ nome: 'Escola', pix: { tipo: 'boleto' } }), ['pix.tipo']);
    assert.deepEqual(campos({ nome: 'Escola', pix: { tipo: 'cpf', chave: '1', recebedor: '!!', cidade: '' } }), [
      'pix.chave',
      'pix.recebedor',
      'pix.cidade',
    ]);
  });
});
