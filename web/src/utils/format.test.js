import { describe, expect, it } from 'vitest';
import {
  foiAlterado,
  FORMAS_PAGAMENTO,
  formatarContato,
  formatarMoeda,
  formatarMoedaCurta,
  formatarPercentual,
  iniciais,
  linkDoContato,
  nomeSugeridoPlano,
  plural,
  rotuloFrequencia,
  rotuloPapel,
  rotuloStatusAula,
  rotuloStatusMensalidade,
  rotuloTipoPlano,
} from './format.js';

describe('contato tocável', () => {
  it('telefone vira ligação; e-mail, mensagem; o resto fica só texto', () => {
    expect(linkDoContato('(47) 99999-0001')).toBe('tel:+5547999990001');
    expect(linkDoContato('47 3333-0001')).toBe('tel:+554733330001');
    expect(linkDoContato('+55 47 99999-0001')).toBe('tel:+5547999990001');
    expect(linkDoContato('mae.ana@email.com')).toBe('mailto:mae.ana@email.com');
    expect(linkDoContato('falar com a mãe')).toBeNull();
    expect(linkDoContato('9999')).toBeNull();
    expect(linkDoContato(null)).toBeNull();
  });
});

describe('mensalidades e indicadores', () => {
  it('situação da mensalidade, formas de pagamento e percentual', () => {
    expect(rotuloStatusMensalidade('atrasada')).toBe('Atrasada');
    expect(rotuloStatusMensalidade('outra')).toBe('outra');
    expect(rotuloStatusMensalidade(undefined)).toBe('');
    expect(FORMAS_PAGAMENTO.map((forma) => forma.valor)).toEqual(['pix', 'dinheiro']);
    expect(formatarPercentual(83)).toBe('83%');
    expect(formatarPercentual(0)).toBe('0%');
    expect(formatarPercentual(null)).toBe('—');
  });
});

describe('formatação', () => {
  it('formata moeda em reais', () => {
    expect(formatarMoeda(140)).toMatch(/R\$\s?140,00/);
    expect(formatarMoeda('abc')).toBe('—');
  });
  it('formato curto: sem centavos quando o valor é redondo', () => {
    expect(formatarMoedaCurta(140)).toMatch(/^R\$\s?140$/);
    expect(formatarMoedaCurta(260.5)).toMatch(/^R\$\s?260,50$/);
    expect(formatarMoedaCurta(1500)).toMatch(/^R\$\s?1\.500$/);
    expect(formatarMoedaCurta(undefined)).toBe('—');
  });
  it('traduz papéis e tipos de plano', () => {
    expect(rotuloPapel('coordenacao')).toBe('Coordenação');
    expect(rotuloPapel('outro')).toBe('outro');
    expect(rotuloPapel()).toBe('');
    expect(rotuloTipoPlano('grupo')).toBe('Grupo');
    expect(rotuloTipoPlano()).toBe('');
    expect(rotuloStatusAula('cancelada')).toBe('Cancelada');
    expect(rotuloStatusAula('outro')).toBe('outro');
    expect(rotuloStatusAula()).toBe('');
  });
  it('flexiona singular e plural', () => {
    expect(plural(1, 'aula')).toBe('1 aula');
    expect(plural(0, 'aula')).toBe('0 aulas');
    expect(plural(3, 'aula agendada', 'aulas agendadas')).toBe('3 aulas agendadas');
  });
  it('formata telefone ao sair do campo; e-mail e número incompleto ficam como estão', () => {
    expect(formatarContato('47999990001')).toBe('(47) 99999-0001');
    expect(formatarContato(' 47 3333 0001 ')).toBe('(47) 3333-0001');
    expect(formatarContato('+55 (47) 99999-0001')).toBe('(47) 99999-0001');
    expect(formatarContato('(47) 99999-0001')).toBe('(47) 99999-0001');
    expect(formatarContato('ana@email.com ')).toBe('ana@email.com');
    expect(formatarContato('9999')).toBe('9999');
    expect(formatarContato('')).toBe('');
    expect(formatarContato(undefined)).toBe('');
  });
  it('detecta formulário alterado campo a campo', () => {
    expect(foiAlterado({ nome: 'Ana', planoId: '1' }, { nome: 'Ana', planoId: 1 })).toBe(false);
    expect(foiAlterado({ nome: 'Ana ' }, { nome: 'Ana' })).toBe(true);
    expect(foiAlterado({ nome: '', extra: undefined }, { nome: '' })).toBe(false);
    expect(foiAlterado({ senha: 'x' }, {})).toBe(true);
  });
  it('frequência e nome sugerido do plano por extenso, sem "1x/semana"', () => {
    expect(rotuloFrequencia(1)).toBe('1 aula por semana');
    expect(rotuloFrequencia('3')).toBe('3 aulas por semana');
    expect(nomeSugeridoPlano({ tipo: 'particular', freqSemanal: '1' })).toBe('Particular · 1 aula por semana');
    expect(nomeSugeridoPlano({ tipo: 'grupo', freqSemanal: 2 })).toBe('Grupo · 2 aulas por semana');
  });
  it('gera até duas iniciais', () => {
    expect(iniciais('Ana Beatriz Souza')).toBe('AB');
    expect(iniciais('  luiz ')).toBe('L');
    expect(iniciais(undefined)).toBe('');
  });
});
