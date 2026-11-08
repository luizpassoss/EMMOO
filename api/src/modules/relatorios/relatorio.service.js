import {
  EM_ABERTO,
  isMesReferencia,
  mesDaData,
  nomeDaForma,
  nomeDoMes,
  situacaoDaMensalidade,
  somarMeses,
} from '../../domain/mensalidades.js';
import { dataCsv, gerarCsv, numeroCsv } from '../../shared/csv.js';
import { formatarDataBR, horaAtual, hojeISO, somarDias } from '../../shared/datas.js';
import { ValidationError } from '../../shared/errors.js';
import { percentualDePresenca } from '../indicadores/indicador.service.js';

const SITUACAO = { paga: 'Paga', pendente: 'Pendente', atrasada: 'Atrasada', cancelada: 'Cancelada' };
export const PLANILHAS = ['mensalidades', 'presenca'];
const somar = (lista) => Math.round(lista.reduce((total, item) => total + Number(item.valor), 0) * 100) / 100;
const porNome = (a, b) => a.aluno.localeCompare(b.aluno, 'pt-BR');

/** RF15 — relatório mensal (financeiro e presença), na tela, em PDF e em planilha (CSV) para a contabilidade. */
export function createRelatorioService({
  alunos,
  aulas,
  mensalidades,
  usuarios,
  escola,
  documentos,
  hoje = hojeISO,
  agora = horaAtual,
}) {
  async function mensal(query = {}) {
    const mes = query.mes || mesDaData(hoje());
    if (!isMesReferencia(mes)) throw new ValidationError([{ campo: 'mes', mensagem: 'Informe um mês válido.' }]);
    const periodo = { inicio: `${mes}-01`, fim: somarDias(`${somarMeses(mes, 1)}-01`, -1) };
    const [todos, doMes, mensalidadesDoMes, responsaveis] = await Promise.all([
      alunos.list(),
      aulas.list(periodo),
      mensalidades.list({ mes }),
      usuarios ? usuarios.list({ papel: 'responsavel' }) : [],
    ]);
    const alunoPorId = new Map(todos.map((aluno) => [aluno.id, aluno]));
    const nomeDoAluno = (alunoId) => alunoPorId.get(alunoId)?.nome ?? 'Aluno excluído';
    const responsavelPorId = new Map(responsaveis.map((responsavel) => [responsavel.id, responsavel.nome]));
    const dataDeHoje = hoje();
    const comSituacao = mensalidadesDoMes.map((mensalidade) => ({ ...mensalidade, situacao: situacaoDaMensalidade(mensalidade, dataDeHoje) }));
    const quantos = (situacao) => comSituacao.filter((mensalidade) => mensalidade.situacao === situacao).length;
    // A cancelada fica na lista (com o motivo), mas não conta no previsto: a escola desistiu de cobrá-la.
    const cobradas = comSituacao.filter((mensalidade) => mensalidade.situacao !== 'cancelada');

    const aconteceram = doMes.filter((aula) => aula.status !== 'cancelada');
    const porAluno = [...new Set(aconteceram.map((aula) => aula.alunoId))]
      .map((alunoId) => {
        const doAluno = aconteceram.filter((aula) => aula.alunoId === alunoId);
        return {
          aluno: nomeDoAluno(alunoId),
          aulas: doAluno.length,
          presencas: doAluno.filter((aula) => aula.status === 'realizada').length,
          faltas: doAluno.filter((aula) => aula.status === 'falta').length,
          reposicoes: doAluno.filter((aula) => aula.reposicaoDeId != null).length,
          percentual: percentualDePresenca(doAluno),
        };
      })
      .sort(porNome);

    return {
      escola: (await escola())?.nome ?? 'EMMOO',
      mes,
      mesNome: nomeDoMes(mes),
      geradoEm: `${formatarDataBR(dataDeHoje)} às ${agora()}`,
      financeiro: {
        previsto: somar(cobradas),
        recebido: somar(cobradas.filter((mensalidade) => mensalidade.situacao === 'paga')),
        emAberto: somar(cobradas.filter((mensalidade) => EM_ABERTO.includes(mensalidade.situacao))),
        atrasado: somar(cobradas.filter((mensalidade) => mensalidade.situacao === 'atrasada')),
        quantidade: {
          paga: quantos('paga'),
          pendente: quantos('pendente'),
          atrasada: quantos('atrasada'),
          cancelada: quantos('cancelada'),
        },
      },
      mensalidades: comSituacao
        .map((mensalidade) => {
          const responsavelId = alunoPorId.get(mensalidade.alunoId)?.usuarioRespId;
          return {
            aluno: nomeDoAluno(mensalidade.alunoId),
            responsavel: (responsavelId && responsavelPorId.get(responsavelId)) || null,
            vencimento: mensalidade.vencimento,
            valor: mensalidade.valor,
            valorOriginal: mensalidade.valorOriginal ?? null,
            situacao: SITUACAO[mensalidade.situacao],
            dataPagamento: mensalidade.dataPagamento,
            formaPagamento: nomeDaForma(mensalidade.formaPagamento),
            numeroRecibo: mensalidade.situacao === 'paga' ? (mensalidade.numeroRecibo ?? mensalidade.id) : null,
            observacao:
              (mensalidade.situacao === 'cancelada' ? mensalidade.cancelamentoMotivo : mensalidade.ajusteMotivo) ?? null,
          };
        })
        .sort(porNome),
      presenca: { percentual: percentualDePresenca(aconteceram), porAluno },
    };
  }

  /** As duas planilhas do mês: cabeçalho e linhas. */
  const PLANILHA = {
    mensalidades: (dados) => [
      [
        'Aluno',
        'Responsável',
        'Mês de referência',
        'Vencimento',
        'Valor (R$)',
        'Valor antes do ajuste (R$)',
        'Situação',
        'Data do pagamento',
        'Forma de pagamento',
        'Nº do recibo',
        'Observação',
      ],
      dados.mensalidades.map((linha) => [
        linha.aluno,
        linha.responsavel ?? '',
        dados.mes,
        dataCsv(linha.vencimento),
        numeroCsv(linha.valor),
        linha.valorOriginal == null ? '' : numeroCsv(linha.valorOriginal),
        linha.situacao,
        dataCsv(linha.dataPagamento),
        linha.formaPagamento ?? '',
        linha.numeroRecibo == null ? '' : String(linha.numeroRecibo).padStart(6, '0'),
        linha.observacao ?? '',
      ]),
    ],
    presenca: (dados) => [
      ['Aluno', 'Aulas', 'Presenças', 'Faltas', 'Reposições', 'Presença (%)'],
      dados.presenca.porAluno.map((linha) => [
        linha.aluno,
        linha.aulas,
        linha.presencas,
        linha.faltas,
        linha.reposicoes,
        linha.percentual ?? '',
      ]),
    ],
  };

  return {
    mensal,
    async pdf(query = {}) {
      const dados = await mensal(query);
      return { arquivo: `relatorio-${dados.mes}.pdf`, conteudo: await documentos.gerarRelatorioMensal(dados) };
    },
    /** Planilha do mês (mensalidades ou presença) no formato que o Excel em português abre direto. */
    async csv(query = {}) {
      const tipo = query.tipo || 'mensalidades';
      if (!PLANILHAS.includes(tipo)) {
        throw new ValidationError([{ campo: 'tipo', mensagem: 'Escolha a planilha: mensalidades ou presenca.' }]);
      }
      const dados = await mensal(query);
      const [cabecalho, linhas] = PLANILHA[tipo](dados);
      return { arquivo: `${tipo}-${dados.mes}.csv`, conteudo: gerarCsv(cabecalho, linhas) };
    },
  };
}
