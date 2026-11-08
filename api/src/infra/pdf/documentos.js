import PDFDocument from 'pdfkit';

/**
 * RF15 — recibos e relatórios em PDF, desenhados com as cores do app (grafite sobre cinzas).
 * Usa a Helvetica padrão do PDF, que cobre os acentos do português ("ç", "ã", "·", "—").
 */
const COR = { tinta: '#1c1917', texto: '#292524', suave: '#6b645f', linha: '#e7e5e4', fundo: '#f5f5f4' };
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (valor) => moeda.format(Number(valor));
const dataBR = (dataISO) => (dataISO ? dataISO.split('-').reverse().join('/') : '—');

/** Rodapé "Página 1 de 3" em todas as páginas (só quando há mais de uma). */
function numerarPaginas(doc) {
  const { start, count } = doc.bufferedPageRange();
  if (count < 2) return;
  for (let indice = start; indice < start + count; indice += 1) {
    doc.switchToPage(indice);
    const margemInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // escrever no rodapé sem o pdfkit abrir outra página
    doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text(
      `Página ${indice - start + 1} de ${count}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right', lineBreak: false },
    );
    doc.page.margins.bottom = margemInferior;
  }
}

/** Monta o PDF em memória e devolve o Buffer. */
function gerarPdf({ titulo, tamanho = 'A4', layout = 'portrait' }, desenhar) {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: tamanho,
      layout,
      margin: 48,
      bufferPages: true,
      info: { Title: titulo, Author: 'EMMOO' },
    });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rejeitar);
    try {
      desenhar(doc);
      numerarPaginas(doc);
      doc.end();
    } catch (erro) {
      rejeitar(erro);
    }
  });
}

/** Cabeçalho com a marca: "EMMOO" espaçado e o nome da escola embaixo. */
function marca(doc, escola) {
  const x = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COR.tinta).text('EMMOO', x, doc.page.margins.top, { characterSpacing: 3 });
  doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text(escola, x, doc.y + 1);
}

function linhaHorizontal(doc, y) {
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.8).strokeColor(COR.linha).stroke();
}

/**
 * Recibo de mensalidade paga (RF11/RF15), em meia folha (A5 deitada).
 * @param {{ escola: string, numero: number, pagador: string, aluno: string, instrumento: string, plano: string|null,
 *   mesReferencia: string, valor: number, valorExtenso: string, dataPagamento: string, formaPagamento: string,
 *   emitidoEm: string }} dados — mesReferencia por extenso ("outubro de 2026"); datas "AAAA-MM-DD"
 */
export function gerarRecibo(dados) {
  return gerarPdf({ titulo: `Recibo ${dados.numero}`, tamanho: 'A5', layout: 'landscape' }, (doc) => {
    const esquerda = doc.page.margins.left;
    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const direita = esquerda + largura;

    marca(doc, dados.escola);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COR.tinta).text('RECIBO', esquerda, doc.page.margins.top, { width: largura, align: 'right', characterSpacing: 1.5 });
    doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text(`Nº ${String(dados.numero).padStart(6, '0')}`, esquerda, doc.y + 1, { width: largura, align: 'right' });

    linhaHorizontal(doc, 100);

    // Valor em destaque, numa caixa clara à direita.
    const caixa = { largura: 170, altura: 46, x: direita - 170, y: 116 };
    doc.roundedRect(caixa.x, caixa.y, caixa.largura, caixa.altura, 8).fill(COR.fundo);
    doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text('VALOR', caixa.x + 14, caixa.y + 9, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(COR.tinta).text(formatarMoeda(dados.valor), caixa.x + 14, caixa.y + 21);

    const referente = dados.plano
      ? `referente à mensalidade de ${dados.mesReferencia} de ${dados.aluno} (${dados.instrumento} — plano ${dados.plano}).`
      : `referente à mensalidade de ${dados.mesReferencia} de ${dados.aluno} (${dados.instrumento}).`;
    doc.font('Helvetica').fontSize(11).fillColor(COR.texto);
    doc.text('Recebemos de ', esquerda, 182, { continued: true, width: largura, lineGap: 4 });
    doc.font('Helvetica-Bold').text(dados.pagador, { continued: true });
    doc.font('Helvetica').text(` a importância de ${formatarMoeda(dados.valor)} (${dados.valorExtenso}), ${referente}`);

    const detalhesY = doc.y + 16;
    const coluna = largura / 2;
    doc.font('Helvetica').fontSize(8).fillColor(COR.suave);
    doc.text('FORMA DE PAGAMENTO', esquerda, detalhesY, { characterSpacing: 1 });
    doc.text('DATA DO PAGAMENTO', esquerda + coluna, detalhesY, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.tinta);
    doc.text(dados.formaPagamento, esquerda, detalhesY + 12);
    doc.text(dataBR(dados.dataPagamento), esquerda + coluna, detalhesY + 12);

    // Rodapé: emissão à esquerda e linha de assinatura à direita.
    const rodapeY = doc.page.height - doc.page.margins.bottom - 30;
    doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text(`Emitido em ${dataBR(dados.emitidoEm)}`, esquerda, rodapeY + 14);
    doc.moveTo(direita - 200, rodapeY + 10).lineTo(direita, rodapeY + 10).lineWidth(0.8).strokeColor(COR.suave).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text(`${dados.escola} — Coordenação`, direita - 200, rodapeY + 14, { width: 200, align: 'center' });
  });
}

/** Corta o texto com "…" para caber na largura (a célula da tabela tem uma linha só). */
function caber(doc, texto, largura, opcoes = {}) {
  let ajustado = String(texto);
  if (doc.widthOfString(ajustado, opcoes) <= largura) return ajustado;
  while (ajustado.length > 1 && doc.widthOfString(`${ajustado}…`, opcoes) > largura) ajustado = ajustado.slice(0, -1);
  return `${ajustado.trimEnd()}…`;
}

/** Tabela simples: cabeçalho em cinza, linhas separadas por fio claro, nova página quando não cabe. */
function tabela(doc, colunas, linhas) {
  const esquerda = doc.page.margins.left;
  const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const larguras = colunas.map((coluna) => coluna.largura * largura);
  const alturaLinha = 20;
  const fimDaPagina = () => doc.page.height - doc.page.margins.bottom - 24;

  function cabecalho() {
    const y = doc.y;
    doc.rect(esquerda, y, largura, alturaLinha).fill(COR.fundo);
    let x = esquerda;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.suave);
    colunas.forEach((coluna, indice) => {
      const opcoes = { characterSpacing: 0.4 };
      const titulo = caber(doc, coluna.titulo.toUpperCase(), larguras[indice] - 12, opcoes);
      doc.text(titulo, x + 6, y + 6, { ...opcoes, width: larguras[indice] - 12, align: coluna.alinhar ?? 'left', lineBreak: false });
      x += larguras[indice];
    });
    doc.y = y + alturaLinha;
  }

  cabecalho();
  for (const linha of linhas) {
    if (doc.y + alturaLinha > fimDaPagina()) {
      doc.addPage();
      cabecalho();
    }
    const y = doc.y;
    let x = esquerda;
    doc.font('Helvetica').fontSize(9).fillColor(COR.texto);
    linha.forEach((celula, indice) => {
      const texto = caber(doc, celula, larguras[indice] - 12);
      doc.text(texto, x + 6, y + 6, { width: larguras[indice] - 12, align: colunas[indice].alinhar ?? 'left', lineBreak: false });
      x += larguras[indice];
    });
    doc.moveTo(esquerda, y + alturaLinha).lineTo(esquerda + largura, y + alturaLinha).lineWidth(0.5).strokeColor(COR.linha).stroke();
    doc.y = y + alturaLinha;
  }
  if (linhas.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text('Nada a mostrar neste mês.', esquerda + 6, doc.y + 6);
    doc.y += alturaLinha;
  }
}

function tituloDeSecao(doc, texto) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COR.tinta).text(texto, doc.page.margins.left, doc.y);
  doc.moveDown(0.5);
}

/**
 * Relatório mensal (RF15): financeiro, mensalidades em aberto e presença por aluno.
 * @param {{ escola: string, mesNome: string, geradoEm: string, financeiro: object, mensalidades: object[], presenca: object }} dados
 */
export function gerarRelatorioMensal(dados) {
  return gerarPdf({ titulo: `Relatório mensal — ${dados.mesNome}` }, (doc) => {
    const esquerda = doc.page.margins.left;
    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    marca(doc, dados.escola);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COR.tinta).text(`Relatório de ${dados.mesNome}`, esquerda, 96);
    doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text(`Gerado em ${dados.geradoEm}`, esquerda, doc.y + 2);

    // Indicadores em quatro caixas.
    const caixas = [
      ['PREVISTO', formatarMoeda(dados.financeiro.previsto)],
      ['RECEBIDO', formatarMoeda(dados.financeiro.recebido)],
      ['EM ABERTO', formatarMoeda(dados.financeiro.emAberto)],
      ['PRESENÇA', dados.presenca.percentual === null ? '—' : `${dados.presenca.percentual}%`],
    ];
    const y = doc.y + 18;
    const vao = 10;
    const larguraCaixa = (largura - vao * (caixas.length - 1)) / caixas.length;
    caixas.forEach(([rotulo, valor], indice) => {
      const x = esquerda + indice * (larguraCaixa + vao);
      doc.roundedRect(x, y, larguraCaixa, 52, 8).fill(COR.fundo);
      doc.font('Helvetica').fontSize(7.5).fillColor(COR.suave).text(rotulo, x + 12, y + 11, { characterSpacing: 1 });
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COR.tinta).text(valor, x + 12, y + 25, { width: larguraCaixa - 24 });
    });
    doc.y = y + 52;
    const { quantidade } = dados.financeiro;
    doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave).text(
      `Em atraso: ${formatarMoeda(dados.financeiro.atrasado)} · Pagas: ${quantidade.paga} · Pendentes: ${quantidade.pendente} · Atrasadas: ${quantidade.atrasada}` +
        (quantidade.cancelada ? ` · Canceladas: ${quantidade.cancelada}` : ''),
      esquerda,
      doc.y + 8,
    );

    tituloDeSecao(doc, 'Mensalidades');
    tabela(
      doc,
      [
        { titulo: 'Aluno', largura: 0.34 },
        { titulo: 'Vencimento', largura: 0.15 },
        { titulo: 'Valor', largura: 0.15, alinhar: 'right' },
        { titulo: 'Situação', largura: 0.14 },
        { titulo: 'Pagamento', largura: 0.22 },
      ],
      dados.mensalidades.map((m) => [
        m.aluno,
        dataBR(m.vencimento),
        formatarMoeda(m.valor),
        m.situacao,
        m.dataPagamento ? `${dataBR(m.dataPagamento)} · ${m.formaPagamento}` : '—',
      ]),
    );

    tituloDeSecao(doc, 'Presença por aluno');
    tabela(
      doc,
      [
        { titulo: 'Aluno', largura: 0.3 },
        { titulo: 'Aulas', largura: 0.11, alinhar: 'right' },
        { titulo: 'Presenças', largura: 0.15, alinhar: 'right' },
        { titulo: 'Faltas', largura: 0.12, alinhar: 'right' },
        { titulo: 'Reposições', largura: 0.17, alinhar: 'right' },
        { titulo: 'Presença', largura: 0.15, alinhar: 'right' },
      ],
      dados.presenca.porAluno.map((linha) => [
        linha.aluno,
        linha.aulas,
        linha.presencas,
        linha.faltas,
        linha.reposicoes,
        linha.percentual === null ? '—' : `${linha.percentual}%`,
      ]),
    );
  });
}
