import { describe, expect, it } from 'vitest';
import { formatarMoeda, iniciais, plural, rotuloPapel, rotuloStatusAula, rotuloTipoPlano } from './format.js';

describe('formatação', () => {
  it('formata moeda em reais', () => {
    expect(formatarMoeda(140)).toMatch(/R\$\s?140,00/);
    expect(formatarMoeda('abc')).toBe('—');
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
  it('gera até duas iniciais', () => {
    expect(iniciais('Ana Beatriz Souza')).toBe('AB');
    expect(iniciais('  luiz ')).toBe('L');
    expect(iniciais(undefined)).toBe('');
  });
});
