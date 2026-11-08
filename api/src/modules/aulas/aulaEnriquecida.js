/** Resumo de uma aula para citar em outra (ex.: "reposição da aula de 12/10 às 14:00"). */
export const resumoDaAula = (aula) => ({
  id: aula.id,
  data: aula.data,
  hora: aula.hora,
  duracaoMin: aula.duracaoMin,
  status: aula.status,
});

/**
 * Aulas como as telas precisam: com o nome do aluno e do professor e o que aconteceu com cada uma —
 * falta avisada (RF06), reposição de outra aula (RF07) e diário preenchido (RF09).
 * Faz uma consulta de cada tipo para a lista inteira, não uma por aula.
 */
export function createEnriquecedorDeAulas({ alunos, usuarios, solicitacoes, diarios }) {
  return async function enriquecer(lista) {
    if (lista.length === 0) return [];
    const ids = lista.map((aula) => aula.id);
    const [todosAlunos, professores, avisos, comDiario] = await Promise.all([
      alunos.list(),
      usuarios.list({ papel: 'professor' }),
      solicitacoes.list({ aulaIds: ids, tipo: 'falta' }),
      diarios.list({ aulaIds: ids }),
    ]);
    const alunoPorId = new Map(todosAlunos.map((aluno) => [aluno.id, aluno]));
    const professorPorId = new Map(professores.map((professor) => [professor.id, professor]));
    const avisoPorAula = new Map(avisos.map((aviso) => [aviso.aulaId, aviso]));
    const aulasComDiario = new Set(comDiario.map((diario) => diario.aulaId));
    return lista.map((aula) => {
      const aluno = alunoPorId.get(aula.alunoId);
      const professor = professorPorId.get(aula.professorId);
      // Aviso que ainda vale: a aula continua como falta (se o professor registrou presença, o aviso perdeu o efeito).
      const aviso = aula.status === 'falta' ? avisoPorAula.get(aula.id) : undefined;
      return {
        ...aula,
        aluno: aluno ? { id: aluno.id, nome: aluno.nome, instrumento: aluno.instrumento } : null,
        professor: professor ? { id: professor.id, nome: professor.nome } : null,
        faltaAvisada: Boolean(aviso),
        liberaReposicao: aviso ? Boolean(aviso.liberaReposicao) : null,
        reposicao: aula.reposicaoDeId != null,
        temDiario: aulasComDiario.has(aula.id),
      };
    });
  };
}
