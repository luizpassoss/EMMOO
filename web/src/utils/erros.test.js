import { describe, expect, it } from 'vitest';
import { mapearErros } from './erros.js';

describe('mapearErros', () => {
  it('mapeia detalhes de validação por campo', () => {
    const erro = { details: [{ campo: 'nome', mensagem: 'Obrigatório' }, { campo: 'planoId', mensagem: 'Inválido' }] };
    expect(mapearErros(erro)).toEqual({ nome: 'Obrigatório', planoId: 'Inválido' });
  });
  it('usa a mensagem geral quando não há detalhes', () => {
    expect(mapearErros(new Error('Falhou'))).toEqual({ geral: 'Falhou' });
    expect(mapearErros(null)).toEqual({ geral: 'Não foi possível concluir a operação.' });
  });
});
