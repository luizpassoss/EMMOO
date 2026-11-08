import { feriadoNaData, jaComecou, separarRestauraveis } from '../../domain/agenda.js';
import { feriadosNacionais } from '../../domain/feriadosNacionais.js';
import { horaAtual, hojeISO } from '../../shared/datas.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, isVazio, parseId, toNumber, validarPeriodo } from '../../shared/validation.js';
import { DURACAO_MAXIMA_DIAS, validarFeriado } from './feriado.validator.js';

/** Feriados nacionais: do ano atual até 2 anos à frente (o calendário de quem planeja o ano letivo). */
const ANOS_A_FRENTE = 2;

/**
 * Feriados e recessos da escola (dias sem aula). Cadastrar um tira da agenda as aulas desses dias e libera os
 * horários; remover devolve as que ainda não passaram — o mesmo mecanismo da inativação do aluno.
 */
export function createFeriadoService({ feriados, aulas, alunos, hoje = hojeISO, agora = horaAtual }) {
  const momento = () => ({ hoje: hoje(), agora: agora() });

  /** Aulas do período que ainda não começaram (as que já aconteceram não se mexe). */
  async function aulasPorVir({ inicio, fim }) {
    const quando = momento();
    return (await aulas.list({ inicio, fim })).filter((aula) => !jaComecou(aula, quando));
  }

  async function criar(input) {
    const { erros, dados } = validarFeriado(input);
    assertValid(erros);
    if (dados.fim < hoje()) throw new ValidationError([{ campo: 'fim', mensagem: 'Este período já passou.' }]);
    const criado = await feriados.create(dados);
    const agendadas = (await aulasPorVir(dados)).filter((aula) => aula.status === 'agendada');
    await aulas.updateMany(
      agendadas.map((aula) => aula.id),
      { status: 'cancelada', motivoCancelamento: 'feriado' },
    );
    return { ...criado, aulasCanceladas: agendadas.length };
  }

  /** Ano dos feriados nacionais: o atual (padrão) ou até dois à frente. */
  function anoValido(valor) {
    const atual = Number(hoje().slice(0, 4));
    const ano = isVazio(valor) ? atual : toNumber(valor);
    if (!Number.isInteger(ano) || ano < atual || ano > atual + ANOS_A_FRENTE) {
      throw new ValidationError([{ campo: 'ano', mensagem: `Escolha um ano entre ${atual} e ${atual + ANOS_A_FRENTE}.` }]);
    }
    return ano;
  }

  /** Os feriados nacionais do ano, com o que já passou e o que a escola já cadastrou (o período inteiro coberto). */
  async function nacionaisDoAno(ano) {
    const cadastrados = await feriados.list({ inicio: `${ano}-01-01`, fim: `${ano}-12-31` });
    const dataDeHoje = hoje();
    return feriadosNacionais(ano).map((feriado) => ({
      ...feriado,
      passado: feriado.fim < dataDeHoje,
      jaCadastrado: cadastrados.some((outro) => outro.inicio <= feriado.inicio && outro.fim >= feriado.fim),
    }));
  }

  return {
    /** Os que tocam o período informado (ex.: a semana da agenda); sem período, os de hoje em diante. */
    async listar(query = {}) {
      if (query.inicio === undefined && query.fim === undefined) return feriados.list({ inicio: hoje() });
      return feriados.list(validarPeriodo(query, DURACAO_MAXIMA_DIAS * 2));
    },

    criar,

    /** Feriados nacionais do ano (fixos e móveis), para a coordenação marcar quais a escola segue. */
    async nacionais(query = {}) {
      const ano = anoValido(query.ano);
      return { ano, feriados: await nacionaisDoAno(ano) };
    },

    /**
     * Cadastra de uma vez os feriados nacionais escolhidos (pelo dia de início). Os que já passaram ou já estão
     * cadastrados ficam de fora; cada um cancela as aulas do dia, como no cadastro à mão.
     */
    async cadastrarNacionais(input = {}) {
      const ano = anoValido(input.ano);
      const escolhidos = Array.isArray(input.datas) ? [...new Set(input.datas)] : [];
      const doAno = await nacionaisDoAno(ano);
      const porInicio = new Map(doAno.map((feriado) => [feriado.inicio, feriado]));
      if (escolhidos.length === 0 || escolhidos.some((data) => !porInicio.has(data))) {
        throw new ValidationError([{ campo: 'datas', mensagem: 'Marque os feriados que a escola vai seguir.' }]);
      }
      let criados = 0;
      let aulasCanceladas = 0;
      for (const data of escolhidos.sort()) {
        const feriado = porInicio.get(data);
        if (feriado.passado || feriado.jaCadastrado) continue;
        const criado = await criar({ descricao: feriado.descricao, inicio: feriado.inicio, fim: feriado.fim });
        criados += 1;
        aulasCanceladas += criado.aulasCanceladas;
      }
      return { ano, criados, ignorados: escolhidos.length - criados, aulasCanceladas };
    },

    /**
     * Remove o feriado e devolve à agenda as aulas que ele tirou, se ainda não passaram e o horário seguir livre.
     * Aula de aluno que foi inativado nesse meio-tempo volta a ser "da inativação" (volta se ele for reativado),
     * e a que cai em outro feriado ainda cadastrado continua fora.
     */
    async remover(id) {
      const feriado = await feriados.findById(parseId(id));
      if (!feriado) throw new NotFoundError('Feriado não encontrado.');
      await feriados.remove(feriado.id);

      const periodo = { inicio: feriado.inicio, fim: feriado.fim };
      const [doPeriodo, outrosFeriados, todosAlunos] = await Promise.all([
        aulas.list(periodo),
        feriados.list(periodo),
        alunos.list(),
      ]);
      const quando = momento();
      const inativos = new Set(todosAlunos.filter((aluno) => aluno.status === 'inativo').map((aluno) => aluno.id));
      const doFeriado = doPeriodo.filter(
        (aula) =>
          aula.status === 'cancelada' &&
          aula.motivoCancelamento === 'feriado' &&
          !jaComecou(aula, quando) &&
          !feriadoNaData(aula.data, outrosFeriados),
      );
      const deInativos = doFeriado.filter((aula) => inativos.has(aula.alunoId)).map((aula) => aula.id);
      const candidatas = doFeriado.filter((aula) => !inativos.has(aula.alunoId));
      const { livres, ocupadas } = separarRestauraveis(candidatas, doPeriodo);

      await aulas.updateMany(livres, { status: 'agendada', motivoCancelamento: null });
      await aulas.updateMany(ocupadas, { motivoCancelamento: 'manual' });
      await aulas.updateMany(deInativos, { motivoCancelamento: 'inativacao' });
      return { aulasRestauradas: livres.length, aulasNaoRestauradas: ocupadas.length };
    },
  };
}
