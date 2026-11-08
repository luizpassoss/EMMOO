import { encontrarAulaEmConflito, feriadoNaData, jaComecou } from '../../domain/agenda.js';
import { mesDaData } from '../../domain/mensalidades.js';
import { contaNoLimiteDeReposicao, LIMITE_REPOSICOES_POR_MES, PRAZO_REPOSICAO_DIAS } from '../../domain/regras.js';
import { avaliarReposicao, dataNoPrazoDaReposicao, origemDaReposicao, prazoDaReposicao } from '../../domain/reposicoes.js';
import { formatarDataBR, horaAtual, hojeISO, somarDias } from '../../shared/datas.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId, parseIdOpcional } from '../../shared/validation.js';
import { createEnriquecedorDeAulas, resumoDaAula } from '../aulas/aulaEnriquecida.js';
import { criarConsultaDeVagas } from '../horarios/horario.service.js';
import { validarPedidoDeReposicao } from './reposicao.validator.js';

/** O que dizer quando a reposição não é possível (RN05, RN11). */
const MOTIVOS = {
  AVISO_FORA_DO_PRAZO: 'A falta foi avisada com menos de 24 horas de antecedência: ela fica registrada, mas não dá direito a reposição.',
  LIMITE_MENSAL_ATINGIDO: `O limite de ${LIMITE_REPOSICOES_POR_MES} reposição por mês já foi usado para as faltas deste mês.`,
  PRAZO_ENCERRADO: `O prazo de ${PRAZO_REPOSICAO_DIAS} dias para repor esta aula terminou.`,
};
const SUGESTOES = 3;

/**
 * RF07 — reposição de aula a pedido do aluno/responsável (RN04), sem cobrança extra (RN06: a mensalidade é
 * mensal, por plano, e não muda). Dá direito a reposição a falta avisada com antecedência (RN05) e a aula
 * cancelada pela escola (RN12). A reposição é num horário livre do mesmo professor, em até 30 dias (RN11),
 * no limite de uma por mês para as faltas do aluno.
 */
export function createReposicaoService({
  aulas,
  alunos,
  usuarios,
  horarios,
  feriados,
  solicitacoes,
  diarios,
  hoje = hojeISO,
  agora = horaAtual,
}) {
  const enriquecer = createEnriquecedorDeAulas({ alunos, usuarios, solicitacoes, diarios });
  const vagasLivres = criarConsultaDeVagas({ horarios, aulas, feriados, hoje, agora });

  /** RN03 — o responsável atua só sobre os seus dependentes; a coordenação, sobre qualquer aluno. */
  async function alunosDoUsuario(usuario, alunoId) {
    if (usuario.papel === 'responsavel') {
      const dependentes = (await alunos.list({ usuarioRespId: usuario.id })).filter((aluno) => aluno.status === 'ativo');
      const ids = dependentes.map((aluno) => aluno.id);
      return alunoId === undefined ? ids : ids.filter((id) => id === alunoId);
    }
    if (alunoId !== undefined) return [alunoId];
    return (await alunos.list({ status: 'ativo' })).map((aluno) => aluno.id);
  }

  /**
   * Aulas perdidas nos últimos 30 dias que ainda não foram repostas, com o que dá para fazer com cada uma.
   * Inclui as que não dão direito (ex.: aviso fora do prazo), para a tela explicar por quê.
   */
  async function creditos(alunoIds) {
    if (alunoIds.length === 0) return [];
    const dataDeHoje = hoje();
    const desde = somarDias(dataDeHoje, -PRAZO_REPOSICAO_DIAS);
    // Desde o primeiro dia do mês mais antigo envolvido: o limite é por mês da aula perdida.
    const lista = await aulas.list({ inicio: `${mesDaData(desde)}-01`, alunoIds });
    const avisos = await solicitacoes.list({ aulaIds: lista.map((aula) => aula.id), tipo: 'falta' });
    const avisoPorAula = new Map(avisos.map((aviso) => [aviso.aulaId, aviso]));
    const porId = new Map(lista.map((aula) => [aula.id, aula]));

    // Reposições que já existem (a cancelada não conta: a aula perdida volta a poder ser reposta).
    const reposicoes = lista.filter((aula) => aula.reposicaoDeId != null && aula.status !== 'cancelada');
    const repostas = new Map(reposicoes.map((aula) => [aula.reposicaoDeId, aula]));
    const usadasNoMes = new Map(); // "alunoId|AAAA-MM" → reposições que contam no limite
    for (const reposicao of reposicoes) {
      const original = porId.get(reposicao.reposicaoDeId);
      const origem = original && origemDaReposicao(original, avisoPorAula.get(original.id));
      if (origem && contaNoLimiteDeReposicao(origem.motivo)) {
        const chave = `${original.alunoId}|${mesDaData(original.data)}`;
        usadasNoMes.set(chave, (usadasNoMes.get(chave) ?? 0) + 1);
      }
    }

    return lista
      .filter((aula) => aula.data >= desde && !repostas.has(aula.id))
      .map((aula) => ({ aula, origem: origemDaReposicao(aula, avisoPorAula.get(aula.id)) }))
      .filter(({ origem }) => origem)
      .map(({ aula, origem }) => {
        const prazoAte = prazoDaReposicao(aula);
        const reposicoesNoMes = usadasNoMes.get(`${aula.alunoId}|${mesDaData(aula.data)}`) ?? 0;
        return {
          aula,
          motivo: origem.motivo === 'falta_aluno' ? 'falta_avisada' : 'aula_cancelada',
          prazoAte,
          ...avaliarReposicao(origem, { reposicoesNoMes, prazoAte, hoje: dataDeHoje }),
        };
      });
  }

  /** Crédito de reposição de uma aula, com o motivo quando bloqueado (ou null, se não dá direito ou já foi reposta). */
  async function creditoDaAula(aula) {
    const lista = await creditos([aula.alunoId]);
    const credito = lista.find((item) => item.aula.id === aula.id);
    return credito ? { ...credito, mensagem: credito.bloqueio ? MOTIVOS[credito.bloqueio] : null } : null;
  }

  /**
   * Vagas do professor no prazo da reposição em que o aluno também está livre. O horário da própria aula
   * perdida fica de fora: a falta libera a vaga, mas repor no mesmo horário não seria reposição.
   */
  async function vagasDaReposicao(original, { de, ate }) {
    const inicio = de > original.data ? de : original.data;
    if (inicio > ate) return [];
    const [vagas, doAluno] = await Promise.all([
      vagasLivres(original.professorId, { inicio, fim: ate }),
      aulas.list({ inicio, fim: ate, alunoId: original.alunoId }),
    ]);
    const ocupados = [...doAluno, { ...original, status: 'agendada' }];
    return vagas.filter((vaga) => !encontrarAulaEmConflito({ ...vaga, duracaoMin: original.duracaoMin }, ocupados));
  }

  async function vagasLivresDaReposicao(original, credito) {
    return vagasDaReposicao(original, { de: hoje(), ate: credito.prazoAte });
  }

  return {
    creditoDaAula,

    /** Aulas que o aluno pode repor (e as que não pode, com o motivo). */
    async disponiveis(query = {}, usuario) {
      const alunoIds = await alunosDoUsuario(usuario, parseIdOpcional(query.alunoId, 'alunoId'));
      const lista = await creditos(alunoIds);
      const enriquecidas = await enriquecer(lista.map((credito) => credito.aula));
      return lista.map((credito, indice) => ({
        aula: enriquecidas[indice],
        motivo: credito.motivo,
        prazoAte: credito.prazoAte,
        contaNoLimite: credito.contaNoLimite,
        permitido: credito.permitido,
        bloqueio: credito.bloqueio,
        mensagem: credito.bloqueio ? MOTIVOS[credito.bloqueio] : null,
      }));
    },

    /** Horários livres para repor a aula: do mesmo professor, dentro do prazo, sem conflito com o aluno. */
    async vagas(aulaId, usuario) {
      const original = await aulas.findById(parseId(aulaId));
      const permitidos = original ? await alunosDoUsuario(usuario, original.alunoId) : [];
      if (!original || !permitidos.includes(original.alunoId)) throw new NotFoundError('Aula não encontrada.');
      const credito = await creditoDaAula(original);
      if (!credito?.permitido) return { prazoAte: credito?.prazoAte ?? null, vagas: [] };
      return { prazoAte: credito.prazoAte, vagas: await vagasLivresDaReposicao(original, credito) };
    },

    /** Marca a reposição num horário livre do professor; se ele não estiver livre, bloqueia e sugere outros. */
    async solicitar(input = {}, usuario) {
      const { erros, dados } = validarPedidoDeReposicao(input);
      assertValid(erros);
      const original = await aulas.findById(dados.aulaId);
      const permitidos = original ? await alunosDoUsuario(usuario, original.alunoId) : [];
      if (!original || !permitidos.includes(original.alunoId)) throw new NotFoundError('Aula não encontrada.');

      const aluno = await alunos.findById(original.alunoId);
      if (aluno?.status !== 'ativo') {
        throw new ValidationError([{ campo: 'aulaId', mensagem: 'Aluno inativo não pode ter aulas agendadas.' }]);
      }
      const professor = await usuarios.findById(original.professorId);
      if (!professor || professor.ativo === false) {
        throw new ConflictError('O professor desta aula está com o acesso desativado. Fale com a coordenação.');
      }
      const credito = await creditoDaAula(original);
      if (!credito) {
        const jaReposta = (await aulas.list({ alunoId: original.alunoId })).some(
          (aula) => aula.reposicaoDeId === original.id && aula.status !== 'cancelada',
        );
        if (jaReposta) throw new ConflictError('Esta aula já tem reposição marcada.');
        const [aviso] = await solicitacoes.list({ aulaIds: [original.id], tipo: 'falta' });
        const daDireito = origemDaReposicao(original, aviso)?.avisoNoPrazo;
        throw new ConflictError(
          daDireito && prazoDaReposicao(original) < hoje() ? MOTIVOS.PRAZO_ENCERRADO : 'Esta aula não dá direito a reposição.',
        );
      }
      if (!credito.permitido) throw new ConflictError(MOTIVOS[credito.bloqueio]);

      // RN11 — entre o dia da aula perdida e o fim do prazo; e não no passado nem em feriado.
      const momento = { hoje: hoje(), agora: agora() };
      const primeiroDia = original.data > momento.hoje ? original.data : momento.hoje;
      if (!dataNoPrazoDaReposicao(original, dados.data) || dados.data < momento.hoje) {
        throw new ValidationError([
          { campo: 'data', mensagem: `Escolha uma data entre ${formatarDataBR(primeiroDia)} e ${formatarDataBR(credito.prazoAte)}.` },
        ]);
      }
      if (jaComecou(dados, momento)) throw new ValidationError([{ campo: 'hora', mensagem: 'Este horário já passou.' }]);
      if (feriadoNaData(dados.data, await feriados.list({ inicio: dados.data, fim: dados.data }))) {
        throw new ValidationError([{ campo: 'data', mensagem: 'Não há aula neste dia (feriado ou recesso da escola).' }]);
      }

      const nova = {
        alunoId: original.alunoId,
        professorId: original.professorId,
        data: dados.data,
        hora: dados.hora,
        duracaoMin: original.duracaoMin,
        status: 'agendada',
        motivoCancelamento: null,
        reposicaoDeId: original.id,
      };
      const [vagasDoDia, doProfessor] = await Promise.all([
        vagasDaReposicao(original, { de: dados.data, ate: dados.data }),
        aulas.list({ inicio: dados.data, fim: dados.data, professorId: original.professorId }),
      ]);
      const livre =
        vagasDoDia.some((vaga) => vaga.hora === dados.hora) && !encontrarAulaEmConflito(nova, doProfessor); // RN09/RN10
      if (!livre) {
        // Fluxo alternativo da RFC: bloqueia e sugere outro horário livre dentro do prazo.
        const sugestoes = (await vagasLivresDaReposicao(original, credito)).slice(0, SUGESTOES);
        const lista = sugestoes.map((vaga) => `${formatarDataBR(vaga.data)} às ${vaga.hora}`).join(', ');
        throw new ConflictError('Horário indisponível.', [
          {
            campo: 'hora',
            mensagem: sugestoes.length
              ? `Este horário não está livre. Horários livres no prazo: ${lista}.`
              : 'Este horário não está livre e não há outro horário livre do professor dentro do prazo.',
          },
        ]);
      }

      const [criada] = await aulas.createMany([nova]);
      await solicitacoes.create({
        alunoId: original.alunoId,
        aulaId: original.id,
        tipo: 'reposicao',
        status: 'aprovada',
        novaData: `${dados.data}T${dados.hora}`,
        liberaReposicao: false,
        dataSolicitacao: new Date().toISOString(),
      });
      const [aula] = await enriquecer([criada]);
      return { aula, reposicaoDe: resumoDaAula(original) };
    },
  };
}
