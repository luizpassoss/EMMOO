import {
  encontrarAulaEmConflito,
  feriadoNaData,
  gerarDatasSemanais,
  jaComecou,
  PERIODO_MAXIMO_DIAS,
  porDataEHora,
} from '../../domain/agenda.js';
import { avisoNoPrazo, dataNoPrazoDaReposicao, horasAteAAula, prazoDaReposicao } from '../../domain/reposicoes.js';
import { formatarDataBR, horaAtual, hojeISO } from '../../shared/datas.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId, parseIdOpcional, validarPeriodo } from '../../shared/validation.js';
import { DURACAO_PADRAO_MIN } from '../planos/plano.validator.js';
import { createEnriquecedorDeAulas, resumoDaAula } from './aulaEnriquecida.js';
import { validarAgendamento, validarDiario, validarPresenca, validarRemarcacao } from './aula.validator.js';

/** "AAAA-MM-DDTHH:MM" → "12/10/2026 às 14:00". */
const dataHoraBR = (texto) => `${formatarDataBR(texto.slice(0, 10))} às ${texto.slice(11, 16)}`;

function descreverConflito(nova, existente, quem) {
  return `${formatarDataBR(nova.data)} às ${nova.hora}: ${quem} já tem aula das ${existente.hora} (${existente.duracaoMin} min).`;
}

/**
 * Casos de uso das aulas: agenda por papel, agendamento (RF05, RN08–RN10), cancelamento, aviso de falta (RF06),
 * presença (RF08) e diário (RF09). `reposicoes` informa se uma aula perdida pode ser reposta (RF07).
 */
export function createAulaService({
  aulas,
  alunos,
  planos,
  usuarios,
  feriados,
  solicitacoes,
  diarios,
  reposicoes,
  hoje = hojeISO,
  agora = horaAtual,
}) {
  const enriquecer = createEnriquecedorDeAulas({ alunos, usuarios, solicitacoes, diarios });
  const momento = () => ({ hoje: hoje(), agora: agora() });

  /** Cada papel enxerga só a sua parte da agenda (RN01–RN03). */
  async function filtroPorPapel(query, usuario) {
    if (usuario.papel === 'professor') return { professorId: usuario.id };
    if (usuario.papel === 'responsavel') {
      const dependentes = await alunos.list({ usuarioRespId: usuario.id });
      return { alunoIds: dependentes.map((aluno) => aluno.id) };
    }
    return {
      professorId: parseIdOpcional(query.professorId, 'professorId'),
      alunoId: parseIdOpcional(query.alunoId, 'alunoId'),
    };
  }

  /**
   * A aula, se o usuário pode vê-la: professor, as próprias (RN02); responsável, as dos dependentes (RN03 —
   * e sem revelar que a aula de outro aluno existe); coordenação, todas.
   */
  async function aulaDoUsuario(id, usuario) {
    const aula = await aulas.findById(parseId(id));
    if (!aula) throw new NotFoundError('Aula não encontrada.');
    if (usuario.papel === 'professor' && aula.professorId !== usuario.id) {
      throw new ForbiddenError('Professores só acessam as próprias aulas.');
    }
    if (usuario.papel === 'responsavel') {
      const aluno = await alunos.findById(aula.alunoId);
      if (aluno?.usuarioRespId !== usuario.id) throw new NotFoundError('Aula não encontrada.');
    }
    return aula;
  }

  async function garantirReferencias({ alunoId, professorId }) {
    const [aluno, professor] = await Promise.all([alunos.findById(alunoId), usuarios.findById(professorId)]);
    const erros = [];
    if (!aluno) erros.push({ campo: 'alunoId', mensagem: 'Aluno não encontrado.' });
    else if (aluno.status !== 'ativo') erros.push({ campo: 'alunoId', mensagem: 'Aluno inativo não pode ter aulas agendadas.' }); // RN08
    if (!professor || professor.papel !== 'professor') erros.push({ campo: 'professorId', mensagem: 'Professor não encontrado.' });
    else if (professor.ativo === false) erros.push({ campo: 'professorId', mensagem: 'Este professor está com o acesso desativado.' });
    if (erros.length > 0) throw new ValidationError(erros);
    return aluno;
  }

  /** Reposição (ativa) já marcada para a aula perdida, se houver. */
  async function reposicaoDe(aula) {
    const doAluno = await aulas.list({ alunoId: aula.alunoId });
    return doAluno.find((outra) => outra.reposicaoDeId === aula.id && outra.status !== 'cancelada') ?? null;
  }

  return {
    /**
     * Agenda do período. Aula cancelada — à mão, pela inativação do aluno ou por um feriado — não aparece:
     * o horário está livre. Ela continua guardada (histórico), e as da inativação e do feriado voltam se o motivo
     * deixar de valer. As que aconteceram (realizada, falta) aparecem normalmente.
     */
    async listar(query = {}, usuario) {
      const periodo = validarPeriodo(query, PERIODO_MAXIMO_DIAS);
      const lista = await aulas.list({ ...periodo, ...(await filtroPorPapel(query, usuario)) });
      return enriquecer(lista.filter((aula) => aula.status !== 'cancelada'));
    },

    /**
     * Tudo sobre uma aula, para a tela da aula: diário, aviso de falta, reposição, o plano deixado na aula
     * anterior do aluno (continuidade pedagógica) e o que o usuário pode fazer com ela agora.
     */
    async detalhe(id, usuario) {
      const aula = await aulaDoUsuario(id, usuario);
      const [[enriquecida], diario, avisos, remarcacoes, doAluno] = await Promise.all([
        enriquecer([aula]),
        diarios.findByAulaId(aula.id),
        solicitacoes.list({ aulaIds: [aula.id], tipo: 'falta' }),
        solicitacoes.list({ aulaIds: [aula.id], tipo: 'remarcacao' }),
        aulas.list({ alunoId: aula.alunoId }),
      ]);
      const aviso = aula.status === 'falta' ? (avisos.at(-1) ?? null) : null;
      const remarcacao = remarcacoes.at(-1) ?? null;
      const original = aula.reposicaoDeId ? (doAluno.find((outra) => outra.id === aula.reposicaoDeId) ?? null) : null;
      const reposta = doAluno.find((outra) => outra.reposicaoDeId === aula.id && outra.status !== 'cancelada') ?? null;

      // Continuidade (RF09): o "plano para a próxima aula" da aula anterior mais recente que tem diário.
      const anteriores = doAluno.filter((outra) => porDataEHora(outra, aula) < 0 && outra.status !== 'cancelada');
      const diariosAnteriores = await diarios.list({ aulaIds: anteriores.map((outra) => outra.id) });
      const comPlano = new Map(diariosAnteriores.filter((d) => d.planoProxima).map((d) => [d.aulaId, d]));
      const ultimaComPlano = anteriores.filter((outra) => comPlano.has(outra.id)).at(-1);

      const quando = momento();
      const comecou = jaComecou(aula, quando);
      const daEscola = usuario.papel === 'coordenacao' || usuario.papel === 'professor';
      const daFamilia = usuario.papel === 'coordenacao' || usuario.papel === 'responsavel';
      const credito = daFamilia && !reposta ? await reposicoes.creditoDaAula(aula) : null;
      return {
        ...enriquecida,
        diario: diario ? { conteudoMinistrado: diario.conteudoMinistrado, planoProxima: diario.planoProxima ?? null } : null,
        avisoFalta: aviso ? { dataSolicitacao: aviso.dataSolicitacao, liberaReposicao: Boolean(aviso.liberaReposicao) } : null,
        // A última remarcação: de quando a aula saiu ("AAAA-MM-DDTHH:MM") e quando isso foi feito.
        remarcadaDe: remarcacao?.dataAnterior
          ? { dataHora: remarcacao.dataAnterior, em: remarcacao.dataSolicitacao, vezes: remarcacoes.length }
          : null,
        reposicaoDe: original ? resumoDaAula(original) : null,
        reposicaoMarcada: reposta ? resumoDaAula(reposta) : null,
        planoAnterior: ultimaComPlano
          ? { aula: resumoDaAula(ultimaComPlano), planoProxima: comPlano.get(ultimaComPlano.id).planoProxima }
          : null,
        reposicaoPossivel: credito
          ? {
              permitido: credito.permitido,
              bloqueio: credito.bloqueio,
              mensagem: credito.mensagem,
              prazoAte: credito.prazoAte,
              contaNoLimite: credito.contaNoLimite,
            }
          : null,
        acoes: {
          registrar: daEscola && comecou && aula.status !== 'cancelada', // RF08/RF09
          cancelar: daEscola && aula.status === 'agendada' && !comecou,
          remarcar: daEscola && aula.status === 'agendada' && !comecou,
          avisarFalta: daFamilia && aula.status === 'agendada' && !comecou, // RF06
          solicitarReposicao: Boolean(credito?.permitido), // RF07
        },
        horasAteAAula: Math.round(horasAteAAula(aula, quando) * 10) / 10,
      };
    },

    /** Agenda a aula (ou uma série semanal). Se qualquer data conflitar, nenhuma aula é criada. */
    async agendar(input) {
      const { erros, dados } = validarAgendamento(input);
      assertValid(erros);
      if (dados.data < hoje()) {
        throw new ValidationError([{ campo: 'data', mensagem: 'Escolha uma data a partir de hoje.' }]);
      }
      if (jaComecou(dados, momento())) {
        throw new ValidationError([{ campo: 'hora', mensagem: 'Este horário de hoje já passou. Escolha um mais tarde.' }]);
      }
      const aluno = await garantirReferencias(dados);
      const plano = await planos.findById(aluno.planoId);
      const duracaoMin = dados.duracaoMin ?? plano?.duracaoMin ?? DURACAO_PADRAO_MIN;

      const todasAsDatas = gerarDatasSemanais(dados.data, dados.semanas);
      const periodo = { inicio: todasAsDatas[0], fim: todasAsDatas.at(-1) };
      const [doProfessor, doAluno, feriadosDoPeriodo] = await Promise.all([
        aulas.list({ ...periodo, professorId: dados.professorId }),
        aulas.list({ ...periodo, alunoId: dados.alunoId }),
        feriados.list(periodo),
      ]);
      // A série pula os feriados e recessos da escola; se não sobrar nenhuma data, explica por quê.
      const datas = todasAsDatas.filter((data) => !feriadoNaData(data, feriadosDoPeriodo));
      if (datas.length === 0) {
        const feriado = feriadoNaData(todasAsDatas[0], feriadosDoPeriodo);
        const mensagem =
          todasAsDatas.length === 1
            ? `${formatarDataBR(todasAsDatas[0])} é "${feriado.descricao}": não há aula nesse dia.`
            : 'Todas as datas caem em feriados ou recessos da escola.';
        throw new ValidationError([{ campo: 'data', mensagem }]);
      }

      const novas = datas.map((data) => ({
        alunoId: dados.alunoId,
        professorId: dados.professorId,
        data,
        hora: dados.hora,
        duracaoMin,
        status: 'agendada',
        motivoCancelamento: null,
      }));
      const conflitos = novas.flatMap((nova) => {
        const doProf = encontrarAulaEmConflito(nova, doProfessor); // RN09
        if (doProf) return [descreverConflito(nova, doProf, 'o professor')];
        const doAl = encontrarAulaEmConflito(nova, doAluno); // RN10
        return doAl ? [descreverConflito(nova, doAl, 'o aluno')] : [];
      });
      if (conflitos.length > 0) {
        const restantes = conflitos.length - 1;
        const outras =
          restantes === 0 ? '' : restantes === 1 ? ' Outra data também conflita.' : ` Outras ${restantes} datas também conflitam.`;
        throw new ConflictError('Conflito de agenda.', [{ campo: 'hora', mensagem: `${conflitos[0]}${outras}` }]);
      }
      return enriquecer(await aulas.createMany(novas));
    },

    async cancelar(id, usuario) {
      const aula = await aulas.findById(parseId(id));
      if (!aula) throw new NotFoundError('Aula não encontrada.');
      if (usuario.papel === 'professor' && aula.professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem cancelar as próprias aulas.');
      }
      if (aula.status !== 'agendada') throw new ConflictError('Apenas aulas agendadas podem ser canceladas.');
      // Aula que já começou não se cancela: ela será registrada como realizada ou falta (RF08).
      if (jaComecou(aula, momento())) {
        throw new ConflictError('Esta aula já começou e não pode mais ser cancelada.');
      }
      const alterada = await aulas.update(aula.id, { status: 'cancelada', motivoCancelamento: 'manual' });
      const [cancelada] = await enriquecer([alterada]);
      return cancelada;
    },

    /**
     * Remarca uma aula agendada que ainda não começou: muda a data e o horário (a mesma aula, com o mesmo aluno,
     * professor e duração), sem conflito com outra aula do professor (RN09) ou do aluno (RN10) e fora de feriado.
     * Fica registrada como solicitação "remarcação" (de quando para quando), para o histórico do aluno.
     * Reposição remarcada continua dentro do prazo de 30 dias da aula perdida (RN11).
     */
    async remarcar(id, input = {}, usuario) {
      const aula = await aulas.findById(parseId(id));
      if (!aula) throw new NotFoundError('Aula não encontrada.');
      if (usuario.papel === 'professor' && aula.professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem remarcar as próprias aulas.');
      }
      const { erros, dados } = validarRemarcacao(input);
      assertValid(erros);
      if (aula.status !== 'agendada') throw new ConflictError('Apenas aulas agendadas podem ser remarcadas.');
      const quando = momento();
      if (jaComecou(aula, quando)) throw new ConflictError('Esta aula já começou e não pode mais ser remarcada.');
      if (dados.data === aula.data && dados.hora === aula.hora) {
        throw new ValidationError([{ campo: 'hora', mensagem: 'Escolha uma data ou um horário diferente do atual.' }]);
      }
      if (dados.data < quando.hoje) {
        throw new ValidationError([{ campo: 'data', mensagem: 'Escolha uma data a partir de hoje.' }]);
      }
      if (jaComecou(dados, quando)) {
        throw new ValidationError([{ campo: 'hora', mensagem: 'Este horário de hoje já passou. Escolha um mais tarde.' }]);
      }
      await garantirReferencias(aula); // aluno ativo (RN08) e professor com acesso
      if (aula.reposicaoDeId != null) {
        const original = await aulas.findById(aula.reposicaoDeId);
        if (original && !dataNoPrazoDaReposicao(original, dados.data)) {
          throw new ValidationError([
            {
              campo: 'data',
              mensagem: `Esta aula é reposição da de ${formatarDataBR(original.data)}: remarque para até ${formatarDataBR(prazoDaReposicao(original))} (prazo de 30 dias).`,
            },
          ]);
        }
      }

      const dia = { inicio: dados.data, fim: dados.data };
      const [doProfessor, doAluno, feriadosDoDia] = await Promise.all([
        aulas.list({ ...dia, professorId: aula.professorId }),
        aulas.list({ ...dia, alunoId: aula.alunoId }),
        feriados.list(dia),
      ]);
      const feriado = feriadoNaData(dados.data, feriadosDoDia);
      if (feriado) {
        throw new ValidationError([
          { campo: 'data', mensagem: `${formatarDataBR(dados.data)} é "${feriado.descricao}": não há aula nesse dia.` },
        ]);
      }
      const nova = { ...aula, data: dados.data, hora: dados.hora };
      const outras = (lista) => lista.filter((outra) => outra.id !== aula.id); // a própria aula não conflita consigo
      const doProf = encontrarAulaEmConflito(nova, outras(doProfessor)); // RN09
      const doAl = doProf ? null : encontrarAulaEmConflito(nova, outras(doAluno)); // RN10
      if (doProf || doAl) {
        throw new ConflictError('Conflito de agenda.', [
          { campo: 'hora', mensagem: descreverConflito(nova, doProf ?? doAl, doProf ? 'o professor' : 'o aluno') },
        ]);
      }

      const anterior = `${aula.data}T${aula.hora}`;
      const novaData = `${dados.data}T${dados.hora}`;
      const alterada = await aulas.update(aula.id, { data: dados.data, hora: dados.hora });
      await solicitacoes.create({
        alunoId: aula.alunoId,
        aulaId: aula.id,
        tipo: 'remarcacao',
        status: 'aprovada',
        novaData,
        dataAnterior: anterior,
        liberaReposicao: false,
        dataSolicitacao: new Date().toISOString(),
      });
      const [remarcada] = await enriquecer([alterada]);
      return {
        aula: remarcada,
        de: { data: aula.data, hora: aula.hora },
        mensagem: `Aula remarcada de ${dataHoraBR(anterior)} para ${dataHoraBR(novaData)}.`,
      };
    },

    /**
     * RF06 — o responsável (ou a coordenação) avisa que o aluno vai faltar. A falta fica registrada e o horário
     * fica livre; com pelo menos 24h de antecedência (RN05) ela dá direito a reposição — com menos, não.
     * A falta numa aula que já é reposição não gera outra reposição.
     */
    async avisarFalta(id, usuario) {
      const aula = await aulaDoUsuario(id, usuario);
      if (aula.status !== 'agendada') throw new ConflictError('Só é possível avisar falta de uma aula agendada.');
      const quando = momento();
      if (jaComecou(aula, quando)) throw new ConflictError('Esta aula já começou: a falta é registrada pelo professor.');
      const liberaReposicao = aula.reposicaoDeId == null && avisoNoPrazo(aula, quando);
      await solicitacoes.create({
        alunoId: aula.alunoId,
        aulaId: aula.id,
        tipo: 'falta',
        status: 'aprovada',
        liberaReposicao,
        dataSolicitacao: new Date().toISOString(),
      });
      const [alterada] = await enriquecer([await aulas.update(aula.id, { status: 'falta' })]);
      return { aula: alterada, liberaReposicao, horasDeAntecedencia: Math.floor(horasAteAAula(aula, quando)) };
    },

    /** RF08 — o professor (das próprias aulas) ou a coordenação registra presença ou falta, a partir do início da aula. */
    async registrarPresenca(id, input = {}, usuario) {
      const aula = await aulaDoUsuario(id, usuario);
      const { erros, dados } = validarPresenca(input);
      assertValid(erros);
      if (aula.status === 'cancelada') throw new ConflictError('Aula cancelada não tem presença.');
      if (!jaComecou(aula, momento())) {
        throw new ValidationError([{ campo: 'status', mensagem: 'A presença é registrada a partir do início da aula.' }]);
      }
      if (dados.status === 'realizada' && aula.status === 'falta' && (await reposicaoDe(aula))) {
        throw new ConflictError('Esta falta já tem reposição marcada. Cancele a reposição antes de registrar presença.');
      }
      const [alterada] = await enriquecer([await aulas.update(aula.id, { status: dados.status })]);
      return alterada;
    },

    /** RF09 — diário: o conteúdo ministrado e o plano para a próxima aula (a partir do início da aula). */
    async salvarDiario(id, input = {}, usuario) {
      const aula = await aulaDoUsuario(id, usuario);
      const { erros, dados } = validarDiario(input);
      assertValid(erros);
      if (aula.status === 'cancelada') throw new ConflictError('Aula cancelada não tem diário.');
      if (!jaComecou(aula, momento())) {
        throw new ValidationError([
          { campo: 'conteudoMinistrado', mensagem: 'O diário é preenchido a partir do início da aula.' },
        ]);
      }
      const diario = await diarios.salvar({ aulaId: aula.id, ...dados });
      return { aulaId: aula.id, conteudoMinistrado: diario.conteudoMinistrado, planoProxima: diario.planoProxima ?? null };
    },
  };
}
