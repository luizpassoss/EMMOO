import { describe, expect, it } from 'vitest';
import { errosDaGrade, GRADE_PADRAO, gradeParaApi, horasDaGrade, resumoDaGrade } from './GradeDeHorarios.jsx';

describe('grade de atendimento (prévia no formulário)', () => {
  it('as horas de início: aulas seguidas que terminam até o fim (a mesma conta da API)', () => {
    expect(horasDaGrade(GRADE_PADRAO)).toEqual(['14:00', '14:45', '15:30', '16:15', '17:00']);
    expect(horasDaGrade({ inicio: '08:00', fim: '10:00', duracaoMin: '60' })).toEqual(['08:00', '09:00']);
    expect(horasDaGrade({ inicio: '', fim: '10:00', duracaoMin: '60' })).toEqual([]);
    expect(horasDaGrade({ inicio: '10:00', fim: '09:00', duracaoMin: '60' })).toEqual([]);
  });

  it('resume o que será criado, ou o que falta', () => {
    expect(resumoDaGrade({ ...GRADE_PADRAO, dias: [2] })).toBe(
      '5 aulas por dia (14:00, 14:45, 15:30, 16:15 e 17:00) — 5 horários na semana.',
    );
    expect(resumoDaGrade({ ...GRADE_PADRAO, fim: '14:45' })).toBe('1 aula por dia (14:00) — 5 horários na semana.');
    expect(resumoDaGrade({ ...GRADE_PADRAO, fim: '14:30' })).toBe('Entre o início e o término não cabe uma aula de 45 minutos.');
    expect(resumoDaGrade({ ...GRADE_PADRAO, dias: [] })).toBe('Nenhum dia marcado: o professor fica sem horários por enquanto.');
  });

  it('corpo para a API e erros com ou sem o prefixo "horarios."', () => {
    expect(gradeParaApi({ dias: [5, 1, 3], inicio: '14:00', fim: '18:00', duracaoMin: '60' })).toEqual({
      dias: [1, 3, 5],
      inicio: '14:00',
      fim: '18:00',
      duracaoMin: 60,
    });
    expect(errosDaGrade({ 'horarios.fim': 'Depois do início.', nome: 'Informe o nome.', dias: 'Escolha um dia.' })).toEqual({
      fim: 'Depois do início.',
      dias: 'Escolha um dia.',
    });
  });
});
