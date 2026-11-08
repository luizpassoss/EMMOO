import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { CabecalhoPagina, Carregando, Indicador, NavegacaoMes, useMes, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { salvarArquivo } from '../utils/arquivo.js';
import { formatarDataCompleta, nomeDoMes } from '../utils/datas.js';
import { formatarMoeda, formatarPercentual, plural } from '../utils/format.js';

const CLASSE_SITUACAO = { Paga: 'paga', Pendente: 'pendente', Atrasada: 'atrasada', Cancelada: 'cancelada' };

/**
 * RF15 — relatório mensal da coordenação: o financeiro (previsto, recebido, em aberto e em atraso, com cada
 * mensalidade) e a presença por aluno. O mesmo conteúdo sai em PDF, para arquivar ou enviar, e em planilha (CSV)
 * para a contabilidade — abre direto no Excel, com acentos, vírgula decimal e datas dd/mm/aaaa.
 */
export default function RelatoriosPage() {
  const [mes, mudarMes, atual] = useMes();
  const [relatorio, setRelatorio] = useState(null);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(''); // 'pdf' | 'mensalidades' | 'presenca' enquanto o arquivo é gerado

  useEffect(() => {
    let ativo = true;
    setRelatorio(null);
    setErro('');
    api
      .get(`/relatorios/mensal?mes=${mes}`)
      .then((dados) => ativo && setRelatorio(dados))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [mes]);

  async function baixar(tipo) {
    setBaixando(tipo);
    setErro('');
    try {
      const { conteudo, arquivo } =
        tipo === 'pdf'
          ? await api.baixar(`/relatorios/mensal/pdf?mes=${mes}`)
          : await api.baixar(`/relatorios/mensal/csv?mes=${mes}&tipo=${tipo}`, 'text/csv, application/json');
      salvarArquivo(conteudo, arquivo ?? (tipo === 'pdf' ? `relatorio-${mes}.pdf` : `${tipo}-${mes}.csv`));
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando('');
    }
  }

  /** Botão da planilha de uma seção (mensalidades ou presença). */
  const botaoPlanilha = (tipo, nome) => (
    <button
      type="button"
      className="botao botao-secundario botao-compacto"
      disabled={!relatorio || Boolean(baixando)}
      aria-label={`Baixar planilha de ${nome} (CSV)`}
      onClick={() => baixar(tipo)}
    >
      <Icone nome="planilha" tamanho={16} />
      {baixando === tipo ? 'Gerando…' : 'Planilha'}
    </button>
  );

  const financeiro = relatorio?.financeiro;
  const quantidade = financeiro?.quantidade;

  return (
    <section>
      <CabecalhoPagina titulo="Relatórios">
        <button type="button" className="botao botao-primario" disabled={!relatorio || Boolean(baixando)} onClick={() => baixar('pdf')}>
          <Icone nome="baixar" tamanho={18} />
          {baixando === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
        </button>
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      <div className="filtros">
        <NavegacaoMes mes={mes} atual={atual} onMudar={mudarMes} />
      </div>

      <div className="cards">
        <Indicador
          rotulo="Previsto"
          valor={financeiro ? formatarMoeda(financeiro.previsto) : '–'}
          detalhe={quantidade?.cancelada > 0 ? `${plural(quantidade.cancelada, 'cancelada', 'canceladas')} fora da conta` : undefined}
          compacto
        />
        <Indicador
          rotulo="Recebido"
          valor={financeiro ? formatarMoeda(financeiro.recebido) : '–'}
          detalhe={quantidade ? plural(quantidade.paga, 'mensalidade paga', 'mensalidades pagas') : undefined}
          compacto
        />
        <Indicador
          rotulo="Em aberto"
          valor={financeiro ? formatarMoeda(financeiro.emAberto) : '–'}
          detalhe={financeiro?.atrasado > 0 ? `${formatarMoeda(financeiro.atrasado)} em atraso` : undefined}
          atencao={financeiro?.atrasado > 0}
          compacto
        />
        <Indicador
          rotulo="Presença"
          valor={relatorio ? formatarPercentual(relatorio.presenca.percentual) : '–'}
          detalhe="das aulas registradas"
          compacto
        />
      </div>

      {!relatorio ? (
        !erro && (
          <div className="card">
            <Carregando linhas={5} />
          </div>
        )
      ) : (
        <>
          <article className="card">
            <div className="card-cabecalho">
              <h2>Mensalidades de {nomeDoMes(mes)}</h2>
              {relatorio.mensalidades.length > 0 && botaoPlanilha('mensalidades', 'mensalidades')}
            </div>
            {relatorio.mensalidades.length === 0 ? (
              <Vazio icone="mensalidades" titulo="Nenhuma mensalidade neste mês." />
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Aluno</th>
                      <th scope="col">Vencimento</th>
                      <th scope="col" className="numero">
                        Valor
                      </th>
                      <th scope="col">Situação</th>
                      <th scope="col">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.mensalidades.map((linha, indice) => (
                      <tr key={`${linha.aluno}-${indice}`}>
                        <th scope="row">{linha.aluno}</th>
                        <td data-rotulo="Vencimento">{formatarDataCompleta(linha.vencimento)}</td>
                        <td className="numero" data-rotulo="Valor">
                          {formatarMoeda(linha.valor)}
                          {linha.valorOriginal != null && (
                            <small className="valor-ajustado" title={linha.observacao ?? undefined}>
                              ajustado (era {formatarMoeda(linha.valorOriginal)})
                            </small>
                          )}
                        </td>
                        <td data-rotulo="Situação">
                          <span className={`pill pill-${CLASSE_SITUACAO[linha.situacao] ?? 'pendente'}`}>{linha.situacao}</span>
                        </td>
                        <td data-rotulo={linha.situacao === 'Cancelada' ? 'Motivo' : 'Pagamento'}>
                          {linha.situacao === 'Cancelada'
                            ? (linha.observacao ?? '—')
                            : linha.dataPagamento
                              ? `${formatarDataCompleta(linha.dataPagamento)}${linha.formaPagamento ? ` · ${linha.formaPagamento}` : ''}`
                              : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="card">
            <div className="card-cabecalho">
              <h2>Presença por aluno</h2>
              {relatorio.presenca.porAluno.length > 0 && botaoPlanilha('presenca', 'presença')}
            </div>
            {relatorio.presenca.porAluno.length === 0 ? (
              <Vazio icone="aulas" titulo="Nenhuma aula neste mês." />
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela tabela-presenca">
                  <thead>
                    <tr>
                      <th scope="col">Aluno</th>
                      <th scope="col" className="numero">
                        Aulas
                      </th>
                      <th scope="col" className="numero">
                        Presenças
                      </th>
                      <th scope="col" className="numero">
                        Faltas
                      </th>
                      <th scope="col" className="numero">
                        Reposições
                      </th>
                      <th scope="col" className="numero">
                        Presença
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.presenca.porAluno.map((linha, indice) => (
                      <tr key={`${linha.aluno}-${indice}`}>
                        <th scope="row">{linha.aluno}</th>
                        <td className="numero" data-rotulo="Aulas">{linha.aulas}</td>
                        <td className="numero" data-rotulo="Presenças">{linha.presencas}</td>
                        <td className="numero" data-rotulo="Faltas">{linha.faltas}</td>
                        <td className="numero" data-rotulo="Reposições">{linha.reposicoes}</td>
                        <td className="numero" data-rotulo="Presença">{formatarPercentual(linha.percentual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="nota-rodape">
              A presença considera as aulas já registradas (presença ou falta). Gerado em {relatorio.geradoEm}.
            </p>
          </article>
        </>
      )}
    </section>
  );
}
