import {
  alertaDevido,
  EM_ABERTO,
  FORMAS_PAGAMENTO,
  isMesReferencia,
  mesDaData,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  motivoParaNaoGerar,
  nomeDaForma,
  nomeDoMes,
  situacaoDaMensalidade,
  somarMeses,
  VALOR_MAXIMO,
  valorDaMensalidade,
  vencimentoDaMensalidade,
} from '../../domain/mensalidades.js';
import { gerarPixCopiaECola } from '../../domain/pix.js';
import { formatarDataBR, hojeISO, isDataISO } from '../../shared/datas.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { valorPorExtenso } from '../../shared/extenso.js';
import { assertValid, isVazio, parseId, parseIdOpcional, toNumber } from '../../shared/validation.js';

export const SITUACOES = ['pendente', 'atrasada', 'paga', 'cancelada'];
const ORDEM_DA_SITUACAO = { atrasada: 0, pendente: 1, paga: 2, cancelada: 3 };
const TODOS_OS_MESES = 'todos';
const arredondar = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;

/** Motivo do ajuste ou do cancelamento: texto de 3 a 160 caracteres, ou o erro do campo. */
function lerMotivo(valor, mensagem) {
  const motivo = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (motivo.length < MOTIVO_MINIMO || motivo.length > MOTIVO_MAXIMO) return { erro: { campo: 'motivo', mensagem } };
  return { motivo };
}
const TENTATIVAS_AUTOMATICAS = 5; // depois disso, só o "reenviar" da coordenação tenta de novo
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const somar = (lista) => Math.round(lista.reduce((total, item) => total + Number(item.valor), 0) * 100) / 100;
/** Nome de arquivo sem acento nem espaço: "Ana Beatriz" → "ana-beatriz". */
const paraArquivo = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
/** Data de matrícula: o dia (no fuso do servidor) em que o aluno foi cadastrado. */
const matriculaDe = (aluno) => hojeISO(new Date(aluno.criadoEm));

/**
 * Mensalidades: geração mensal por plano (RF10, RN08, RN13), baixa com data e forma de pagamento (RF11),
 * alertas de vencimento e atraso (RF12, RN07) e recibo em PDF com numeração sequencial da escola (RF15).
 * A coordenação ajusta o valor (desconto, bolsa, correção) e cancela ou reabre uma cobrança; o responsável
 * paga pelo Pix da escola (QR e "copia e cola"). A reposição não gera cobrança (RN06): a mensalidade é do
 * plano, não de cada aula.
 */
export function createMensalidadeService({
  mensalidades,
  alunos,
  planos,
  usuarios,
  alertas,
  escola,
  mailer,
  documentos,
  qrCode,
  hoje = hojeISO,
}) {
  async function contexto() {
    const [todosAlunos, todosPlanos, responsaveis] = await Promise.all([
      alunos.list(),
      planos.list(),
      usuarios.list({ papel: 'responsavel' }),
    ]);
    return {
      alunoPorId: new Map(todosAlunos.map((aluno) => [aluno.id, aluno])),
      planoPorId: new Map(todosPlanos.map((plano) => [plano.id, plano])),
      responsavelPorId: new Map(responsaveis.map((responsavel) => [responsavel.id, responsavel])),
    };
  }

  /**
   * Mensalidade como a tela precisa: situação de hoje, aluno, plano, responsável, o nome da forma de pagamento,
   * o ajuste de valor e o número do recibo. Os motivos (de ajuste e de cancelamento) são anotações da
   * coordenação: o responsável vê o valor e a situação, não o texto interno (`comMotivos`).
   */
  async function apresentar(lista, { comMotivos = true } = {}) {
    if (lista.length === 0) return [];
    const { alunoPorId, planoPorId, responsavelPorId } = await contexto();
    const dataDeHoje = hoje();
    return lista.map((mensalidade) => {
      const aluno = alunoPorId.get(mensalidade.alunoId);
      const plano = aluno ? planoPorId.get(aluno.planoId) : null;
      const responsavel = aluno?.usuarioRespId ? responsavelPorId.get(aluno.usuarioRespId) : null;
      return {
        id: mensalidade.id,
        mesReferencia: mensalidade.mesReferencia,
        valor: mensalidade.valor,
        valorOriginal: mensalidade.valorOriginal ?? null,
        vencimento: mensalidade.vencimento,
        status: situacaoDaMensalidade(mensalidade, dataDeHoje),
        dataPagamento: mensalidade.dataPagamento,
        formaPagamento: mensalidade.formaPagamento,
        formaPagamentoNome: nomeDaForma(mensalidade.formaPagamento),
        numeroRecibo: mensalidade.numeroRecibo ?? null,
        ...(comMotivos && {
          ajusteMotivo: mensalidade.ajusteMotivo ?? null,
          cancelamentoMotivo: mensalidade.cancelamentoMotivo ?? null,
        }),
        aluno: aluno ? { id: aluno.id, nome: aluno.nome, instrumento: aluno.instrumento } : null,
        plano: plano ? { id: plano.id, nome: plano.nome } : null,
        responsavel: responsavel ? { id: responsavel.id, nome: responsavel.nome } : null,
      };
    });
  }

  async function apresentarUma(mensalidade) {
    const [apresentada] = await apresentar([mensalidade]);
    return apresentada;
  }

  /** Só se mexe no valor e no cancelamento de cobrança em aberto: a paga tem recibo (desfaça a baixa antes). */
  function garantirEmAberto(mensalidade, acao) {
    if (mensalidade.status === 'paga') {
      throw new ConflictError(`Esta mensalidade já está paga. Para ${acao}, desfaça o pagamento antes.`);
    }
    if (mensalidade.status === 'cancelada') throw new ConflictError('Esta mensalidade está cancelada. Reabra-a antes.');
  }

  /** RN03 — o responsável só vê as mensalidades dos seus dependentes (e não descobre as dos outros). */
  async function buscar(id, usuario) {
    const mensalidade = await mensalidades.findById(parseId(id));
    if (!mensalidade) throw new NotFoundError('Mensalidade não encontrada.');
    if (usuario?.papel === 'responsavel') {
      const aluno = await alunos.findById(mensalidade.alunoId);
      if (aluno?.usuarioRespId !== usuario.id) throw new NotFoundError('Mensalidade não encontrada.');
    }
    return mensalidade;
  }

  /** RF10 — gera as mensalidades do mês para os alunos ativos que ainda não têm; pode rodar mais de uma vez. */
  async function gerarDoMes(mes) {
    const [todos, existentes, todosPlanos] = await Promise.all([alunos.list(), mensalidades.list({ mes }), planos.list()]);
    const jaTem = new Set(existentes.map((mensalidade) => mensalidade.alunoId));
    const planoPorId = new Map(todosPlanos.map((plano) => [plano.id, plano]));
    const dataDeHoje = hoje();
    let criadas = 0;
    const ignorados = [];
    for (const aluno of todos) {
      if (jaTem.has(aluno.id)) continue;
      const matricula = matriculaDe(aluno);
      const motivo = motivoParaNaoGerar(aluno, matricula, mes);
      if (motivo) {
        if (aluno.status === 'ativo') ignorados.push({ aluno: { id: aluno.id, nome: aluno.nome }, motivo });
        continue; // RN08: aluno inativo não gera mensalidade
      }
      const plano = planoPorId.get(aluno.planoId);
      if (!plano) {
        ignorados.push({ aluno: { id: aluno.id, nome: aluno.nome }, motivo: 'Plano não encontrado.' });
        continue;
      }
      try {
        await mensalidades.create({
          alunoId: aluno.id,
          mesReferencia: mes,
          valor: valorDaMensalidade(plano.valor, matricula, mes),
          vencimento: vencimentoDaMensalidade(mes, dataDeHoje),
          status: 'pendente',
        });
        criadas += 1;
      } catch (erro) {
        if (!(erro instanceof ConflictError)) throw erro; // outra geração criou no meio do caminho: tudo certo
      }
    }
    return { mes, criadas, jaExistiam: existentes.length, ignorados };
  }

  /** Alertas ainda por enviar, das mensalidades que continuam em aberto (pagou? o alerta perdeu o sentido). */
  async function alertasParaEnviar(naoPagas) {
    const emAberto = new Set(naoPagas.map((mensalidade) => mensalidade.id));
    return (await alertas.list({ status: 'pendente' })).filter((alerta) => emAberto.has(alerta.mensalidadeId));
  }

  function mensagemDoAlerta(alerta, mensalidade, aluno, responsavel, nomeDaEscola) {
    const mes = nomeDoMes(mensalidade.mesReferencia);
    const valor = moeda.format(mensalidade.valor);
    const vencimento = formatarDataBR(mensalidade.vencimento);
    const atraso = alerta.tipo === 'atraso';
    return {
      para: alerta.destinatario,
      assunto: atraso ? `Mensalidade de ${mes} em atraso` : `Mensalidade de ${mes} vence em ${vencimento}`,
      texto: [
        `Olá, ${responsavel?.nome ?? 'responsável'}.`,
        '',
        atraso
          ? `A mensalidade de ${aluno?.nome ?? 'seu dependente'} referente a ${mes}, no valor de ${valor}, venceu em ${vencimento} e ainda não consta como paga.`
          : `A mensalidade de ${aluno?.nome ?? 'seu dependente'} referente a ${mes}, no valor de ${valor}, vence em ${vencimento}.`,
        '',
        'Se o pagamento já foi feito, desconsidere esta mensagem.',
        '',
        nomeDaEscola,
      ].join('\n'),
    };
  }

  /**
   * RF12/RN07 — a mensalidade vencida passa a "atrasada"; registra os alertas de vencimento próximo e de atraso
   * (um de cada por mensalidade) e tenta enviá-los por e-mail ao responsável. O que falhar fica pendente
   * para reenvio, sem bloquear nada.
   */
  async function processarAlertas({ manual = false } = {}) {
    const dataDeHoje = hoje();
    const naoPagas = await mensalidades.list({ naoPagas: true });
    const { alunoPorId, responsavelPorId } = await contexto();
    let mensalidadesAtualizadas = 0;
    let alertasRegistrados = 0;
    for (const mensalidade of naoPagas) {
      const situacao = situacaoDaMensalidade(mensalidade, dataDeHoje);
      if (situacao !== mensalidade.status) {
        await mensalidades.update(mensalidade.id, { status: situacao });
        mensalidadesAtualizadas += 1;
      }
      const tipo = alertaDevido(mensalidade, dataDeHoje);
      const aluno = alunoPorId.get(mensalidade.alunoId);
      const responsavel = aluno?.usuarioRespId ? responsavelPorId.get(aluno.usuarioRespId) : null;
      // Sem responsável com acesso ativo, não há a quem mandar e-mail: o alerta aparece só no sistema.
      if (!tipo || !responsavel || responsavel.ativo === false || !responsavel.email) continue;
      try {
        await alertas.create({ mensalidadeId: mensalidade.id, tipo, destinatario: responsavel.email });
        alertasRegistrados += 1;
      } catch (erro) {
        if (!(erro instanceof ConflictError)) throw erro; // este alerta já foi registrado antes
      }
    }

    let enviados = 0;
    let falhas = 0;
    if (mailer.configurado) {
      const porId = new Map(naoPagas.map((mensalidade) => [mensalidade.id, mensalidade]));
      const nomeDaEscola = (await escola())?.nome ?? 'EMMOO';
      for (const alerta of await alertasParaEnviar(naoPagas)) {
        if (!manual && alerta.tentativas >= TENTATIVAS_AUTOMATICAS) continue;
        const mensalidade = porId.get(alerta.mensalidadeId);
        const aluno = alunoPorId.get(mensalidade.alunoId);
        const responsavel = aluno?.usuarioRespId ? responsavelPorId.get(aluno.usuarioRespId) : null;
        try {
          await mailer.enviar(mensagemDoAlerta(alerta, mensalidade, aluno, responsavel, nomeDaEscola));
          await alertas.update(alerta.id, {
            status: 'enviado',
            enviadoEm: new Date().toISOString(),
            tentativas: alerta.tentativas + 1,
            ultimoErro: null,
          });
          enviados += 1;
        } catch (erro) {
          await alertas.update(alerta.id, {
            tentativas: alerta.tentativas + 1,
            ultimoErro: String(erro?.message ?? erro).slice(0, 200),
          });
          falhas += 1;
        }
      }
    }
    return { mensalidadesAtualizadas, alertasRegistrados, enviados, falhas };
  }

  /** RF12 — o que a coordenação precisa saber: atrasadas, vencendo e como vai o envio por e-mail. */
  async function resumoDeAlertas() {
    const dataDeHoje = hoje();
    const naoPagas = await mensalidades.list({ naoPagas: true });
    const atrasadas = naoPagas.filter((mensalidade) => situacaoDaMensalidade(mensalidade, dataDeHoje) === 'atrasada');
    const vencendo = naoPagas.filter((mensalidade) => alertaDevido(mensalidade, dataDeHoje) === 'vencimento');
    const pendentes = await alertasParaEnviar(naoPagas);
    const enviados = await alertas.list({ status: 'enviado' });
    return {
      atrasadas: { quantidade: atrasadas.length, valor: somar(atrasadas) },
      vencendo: { quantidade: vencendo.length, valor: somar(vencendo) },
      email: {
        configurado: mailer.configurado,
        pendentes: pendentes.length,
        enviados: enviados.length,
        ultimoErro: pendentes.find((alerta) => alerta.ultimoErro)?.ultimoErro ?? null,
      },
    };
  }

  return {
    gerarDoMes,
    processarAlertas,
    resumoDeAlertas,

    /**
     * Coordenação: as do mês (com filtro de situação; `mes=todos` traz todos os meses, ex.: as de um aluno);
     * responsável: todas as dos seus dependentes.
     */
    async listar(query = {}, usuario) {
      if (usuario.papel === 'responsavel') {
        const dependentes = (await alunos.list({ usuarioRespId: usuario.id })).map((aluno) => aluno.id);
        if (dependentes.length === 0) return [];
        const [lista, dadosDaEscola] = await Promise.all([
          apresentar(await mensalidades.list({ alunoIds: dependentes }), { comMotivos: false }),
          escola(),
        ]);
        // A tela oferece "Pagar com Pix" só quando a escola cadastrou a chave e há o que pagar.
        const comPix = Boolean(dadosDaEscola?.pixChave);
        return lista.map((mensalidade) => ({
          ...mensalidade,
          pixDisponivel: comPix && EM_ABERTO.includes(mensalidade.status),
        }));
      }
      const mes = query.mes || mesDaData(hoje());
      if (mes !== TODOS_OS_MESES && !isMesReferencia(mes)) {
        throw new ValidationError([{ campo: 'mes', mensagem: 'Informe um mês válido.' }]);
      }
      const status = query.status || undefined;
      if (status !== undefined && !SITUACOES.includes(status)) {
        throw new ValidationError([
          { campo: 'status', mensagem: 'Situação inválida: use pendente, atrasada, paga ou cancelada.' },
        ]);
      }
      const filtro = { alunoId: parseIdOpcional(query.alunoId, 'alunoId'), ...(mes !== TODOS_OS_MESES && { mes }) };
      const lista = await apresentar(await mensalidades.list(filtro));
      // O que pede ação primeiro: atrasadas, depois pendentes e, no fim, as pagas; dentro de cada uma, por nome.
      return lista
        .filter((mensalidade) => !status || mensalidade.status === status)
        .sort(
          (a, b) =>
            ORDEM_DA_SITUACAO[a.status] - ORDEM_DA_SITUACAO[b.status] ||
            (a.aluno?.nome ?? '').localeCompare(b.aluno?.nome ?? '', 'pt-BR'),
        );
    },

    /**
     * RF11 — histórico de pagamentos: as mensalidades pagas, da mais recente para a mais antiga, com o total
     * recebido e quanto entrou por forma de pagamento. Coordenação: todos (ou de um aluno); responsável: dos dependentes.
     */
    async pagamentos(query = {}, usuario) {
      const alunoId = parseIdOpcional(query.alunoId, 'alunoId');
      let filtro = alunoId === undefined ? {} : { alunoId };
      if (usuario.papel === 'responsavel') {
        const dependentes = (await alunos.list({ usuarioRespId: usuario.id })).map((aluno) => aluno.id);
        const ids = alunoId === undefined ? dependentes : dependentes.filter((id) => id === alunoId);
        filtro = { alunoIds: ids };
      }
      const pagas = filtro.alunoIds?.length === 0 ? [] : (await mensalidades.list(filtro)).filter((m) => m.status === 'paga');
      pagas.sort((a, b) => (b.dataPagamento ?? '').localeCompare(a.dataPagamento ?? '') || b.id - a.id);
      const lista = await apresentar(pagas, { comMotivos: usuario.papel !== 'responsavel' });
      const porForma = Object.fromEntries(
        Object.keys(FORMAS_PAGAMENTO).map((forma) => {
          const daForma = lista.filter((mensalidade) => mensalidade.formaPagamento === forma);
          return [forma, { quantidade: daForma.length, valor: somar(daForma) }];
        }),
      );
      return { pagamentos: lista, totais: { quantidade: lista.length, valor: somar(lista), porForma } };
    },

    /** RF10 — geração pela coordenação: o mês atual ou até dois meses à frente. */
    async gerar(input = {}) {
      const atual = mesDaData(hoje());
      if (!isMesReferencia(input.mes)) throw new ValidationError([{ campo: 'mes', mensagem: 'Informe um mês válido.' }]);
      if (input.mes < atual || input.mes > somarMeses(atual, 2)) {
        throw new ValidationError([
          { campo: 'mes', mensagem: 'Gere as mensalidades do mês atual ou de até dois meses à frente.' },
        ]);
      }
      return gerarDoMes(input.mes);
    },

    /**
     * RF11 — baixa: data (até hoje) e forma de pagamento. Na primeira baixa, a mensalidade recebe o próximo
     * número de recibo da escola (RF15); se a baixa for desfeita e refeita, o número continua o mesmo.
     */
    async registrarPagamento(id, input = {}) {
      const mensalidade = await buscar(id);
      if (mensalidade.status === 'paga') throw new ConflictError('Esta mensalidade já está paga.');
      if (mensalidade.status === 'cancelada') {
        throw new ConflictError('Esta mensalidade está cancelada. Reabra-a antes de registrar o pagamento.');
      }
      const erros = [];
      if (!isDataISO(input.dataPagamento)) erros.push({ campo: 'dataPagamento', mensagem: 'Informe a data do pagamento.' });
      else if (input.dataPagamento > hoje()) {
        erros.push({ campo: 'dataPagamento', mensagem: 'A data do pagamento não pode ser futura.' });
      }
      if (!Object.hasOwn(FORMAS_PAGAMENTO, input.formaPagamento ?? '')) {
        erros.push({ campo: 'formaPagamento', mensagem: 'Escolha a forma de pagamento: Pix ou dinheiro.' });
      }
      assertValid(erros);
      await mensalidades.update(mensalidade.id, {
        status: 'paga',
        dataPagamento: input.dataPagamento,
        formaPagamento: input.formaPagamento,
      });
      return apresentarUma(await mensalidades.registrarNumeroRecibo(mensalidade.id));
    },

    /**
     * Desfaz uma baixa registrada por engano: volta a pendente (ou atrasada, se já venceu).
     * O número do recibo fica com a mensalidade: um recibo já entregue nunca passa a valer para outra.
     */
    async desfazerPagamento(id) {
      const mensalidade = await buscar(id);
      if (mensalidade.status !== 'paga') throw new ConflictError('Esta mensalidade não está paga.');
      const status = situacaoDaMensalidade({ ...mensalidade, status: undefined, dataPagamento: null }, hoje());
      const atualizada = await mensalidades.update(mensalidade.id, { status, dataPagamento: null, formaPagamento: null });
      return apresentarUma(atualizada);
    },

    /**
     * Ajusta o valor de uma cobrança em aberto (desconto, bolsa, correção), com o motivo. Guarda o valor
     * anterior ao primeiro ajuste; voltar a esse valor desfaz o ajuste (e aí o motivo é dispensado).
     */
    async ajustarValor(id, input = {}) {
      const mensalidade = await buscar(id);
      garantirEmAberto(mensalidade, 'mudar o valor');
      const numero = isVazio(input.valor) ? Number.NaN : toNumber(input.valor);
      if (!Number.isFinite(numero) || numero <= 0 || numero > VALOR_MAXIMO) {
        throw new ValidationError([{ campo: 'valor', mensagem: 'Informe um valor maior que zero, até R$ 99.999,99.' }]);
      }
      const valor = arredondar(numero);
      const original = mensalidade.valorOriginal ?? mensalidade.valor;
      if (valor === original) {
        return apresentarUma(
          await mensalidades.update(mensalidade.id, { valor: original, valorOriginal: null, ajusteMotivo: null }),
        );
      }
      const { motivo, erro } = lerMotivo(input.motivo, 'Explique o ajuste (de 3 a 160 caracteres), ex.: desconto de irmãos.');
      assertValid(erro ? [erro] : []);
      return apresentarUma(
        await mensalidades.update(mensalidade.id, { valor, valorOriginal: original, ajusteMotivo: motivo }),
      );
    },

    /**
     * Cancela uma cobrança em aberto (ex.: aluno que saiu, mês sem aula): ela deixa de contar nos totais,
     * na inadimplência e nos alertas, e fica no histórico com o motivo. Pode ser reaberta.
     */
    async cancelar(id, input = {}) {
      const mensalidade = await buscar(id);
      garantirEmAberto(mensalidade, 'cancelar');
      const { motivo, erro } = lerMotivo(input.motivo, 'Explique o cancelamento (de 3 a 160 caracteres).');
      assertValid(erro ? [erro] : []);
      return apresentarUma(
        await mensalidades.update(mensalidade.id, { status: 'cancelada', cancelamentoMotivo: motivo }),
      );
    },

    /** Reabre uma cobrança cancelada: volta a pendente (ou atrasada, se já venceu). */
    async reabrir(id) {
      const mensalidade = await buscar(id);
      if (mensalidade.status !== 'cancelada') throw new ConflictError('Esta mensalidade não está cancelada.');
      const status = situacaoDaMensalidade({ ...mensalidade, status: undefined }, hoje());
      return apresentarUma(await mensalidades.update(mensalidade.id, { status, cancelamentoMotivo: null }));
    },

    /**
     * Pix para pagar uma cobrança em aberto: "copia e cola" e o QR Code com a chave da escola e o valor.
     * O responsável paga as dos seus dependentes (RN03); a baixa continua sendo da coordenação (RF11), que
     * confere o recebimento no extrato — o Pix estático não avisa o sistema.
     */
    async pix(id, usuario) {
      const mensalidade = await buscar(id, usuario);
      if (!EM_ABERTO.includes(mensalidade.status)) {
        throw new ConflictError(
          mensalidade.status === 'paga' ? 'Esta mensalidade já está paga.' : 'Esta mensalidade foi cancelada: não há o que pagar.',
        );
      }
      const dados = await escola();
      if (!dados?.pixChave) {
        throw new ConflictError('A escola ainda não cadastrou a chave Pix. Fale com a coordenação para combinar o pagamento.');
      }
      const [apresentada] = await apresentar([mensalidade], { comMotivos: usuario?.papel !== 'responsavel' });
      const [ano, mes] = mensalidade.mesReferencia.split('-');
      const copiaECola = gerarPixCopiaECola({
        chave: dados.pixChave,
        recebedor: dados.pixRecebedor || dados.nome,
        cidade: dados.pixCidade,
        valor: mensalidade.valor,
        descricao: `Mensalidade ${mes} ${ano} ${apresentada.aluno?.nome ?? ''}`,
      });
      return {
        mensalidade: apresentada,
        valor: mensalidade.valor,
        copiaECola,
        qrCodeSvg: await qrCode(copiaECola),
        recebedor: dados.pixRecebedor || dados.nome,
        chave: { tipo: dados.pixTipo, valor: dados.pixChave },
      };
    },

    /** RF15 — recibo em PDF de uma mensalidade paga. */
    async recibo(id, usuario) {
      const mensalidade = await buscar(id, usuario);
      if (mensalidade.status !== 'paga') {
        throw new ConflictError('O recibo fica disponível depois que o pagamento é registrado.');
      }
      const [dados] = await apresentar([mensalidade]);
      const nomeDoAluno = dados.aluno?.nome ?? 'Aluno';
      const conteudo = await documentos.gerarRecibo({
        escola: (await escola())?.nome ?? 'EMMOO',
        // RF15 — numeração sequencial da escola; pagamentos de antes da numeração usam o id (nunca repetem).
        numero: mensalidade.numeroRecibo ?? mensalidade.id,
        pagador: dados.responsavel?.nome ?? nomeDoAluno,
        aluno: nomeDoAluno,
        instrumento: dados.aluno?.instrumento ?? '—',
        plano: dados.plano?.nome ?? null,
        mesReferencia: nomeDoMes(mensalidade.mesReferencia),
        valor: mensalidade.valor,
        valorExtenso: valorPorExtenso(mensalidade.valor),
        dataPagamento: mensalidade.dataPagamento,
        formaPagamento: dados.formaPagamentoNome ?? '—',
        emitidoEm: hoje(),
      });
      return { arquivo: `recibo-${mensalidade.mesReferencia}-${paraArquivo(nomeDoAluno)}.pdf`, conteudo };
    },

    /** Coordenação pede o envio agora (sem o limite de tentativas automáticas). */
    async enviarAlertas() {
      const resultado = await processarAlertas({ manual: true });
      return { ...resultado, resumo: await resumoDeAlertas() };
    },

    /** Rotina automática (a cada hora): mensalidades do mês atual e alertas. */
    async rotina() {
      const geracao = await gerarDoMes(mesDaData(hoje()));
      return { ...geracao, ...(await processarAlertas()) };
    },
  };
}
