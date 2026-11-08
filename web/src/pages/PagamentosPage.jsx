import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { baixarRecibo } from '../api/recibo.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { CabecalhoPagina, Carregando, Indicador, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { formatarDataCompleta, mesDaData, nomeDoMes } from '../utils/datas.js';
import { FORMAS_PAGAMENTO, formatarMoeda, iniciais, plural } from '../utils/format.js';

const somar = (lista) => lista.reduce((total, mensalidade) => total + Number(mensalidade.valor), 0);
/** "nenhum pagamento", "1 pagamento", "3 pagamentos". */
const quantosPagamentos = (quantidade) => (quantidade === 0 ? 'nenhum pagamento' : plural(quantidade, 'pagamento', 'pagamentos'));

/** Pagamentos agrupados pelo mês em que foram feitos (o mais recente primeiro): [["2026-10", [...]], …]. */
function porMesDoPagamento(pagamentos) {
  const grupos = new Map();
  for (const pagamento of pagamentos) {
    const mes = mesDaData(pagamento.dataPagamento);
    grupos.set(mes, [...(grupos.get(mes) ?? []), pagamento]);
  }
  return [...grupos.entries()];
}

/**
 * RF11 — histórico de pagamentos: tudo o que já foi pago, do mais recente ao mais antigo, com o total recebido,
 * quanto entrou por Pix e em dinheiro, e o recibo de cada um. A coordenação filtra por aluno; o responsável vê
 * os pagamentos dos dependentes (a API faz o recorte).
 */
export default function PagamentosPage() {
  const { usuario } = useAuth();
  const ehCoordenacao = usuario?.papel === 'coordenacao';
  const [params, setParams] = useSearchParams();
  const alunoFiltro = params.get('aluno') ?? '';
  const [pagamentos, setPagamentos] = useState(null);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(null);

  useEffect(() => {
    let ativo = true;
    api
      .get('/mensalidades/pagamentos')
      .then((dados) => ativo && setPagamentos(dados.pagamentos))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function escolherAluno(id) {
    const proximos = new URLSearchParams(params);
    if (id) proximos.set('aluno', id);
    else proximos.delete('aluno');
    setParams(proximos, { replace: true });
  }

  async function recibo(pagamento) {
    setBaixando(pagamento.id);
    setErro('');
    try {
      await baixarRecibo(pagamento);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando(null);
    }
  }

  // Os alunos que aparecem no histórico, para o filtro (com um só, não há o que filtrar).
  const alunos = [...new Map((pagamentos ?? []).filter((p) => p.aluno).map((p) => [String(p.aluno.id), p.aluno])).values()].sort(
    (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  const visiveis = (pagamentos ?? []).filter((pagamento) => !alunoFiltro || String(pagamento.aluno?.id) === alunoFiltro);
  const alunoEscolhido = alunos.find((aluno) => String(aluno.id) === alunoFiltro);
  // A coordenação sempre vê de quem é o pagamento; o responsável com um dependente só (ou com o filtro), não precisa.
  const mostrarAluno = (ehCoordenacao || alunos.length > 1) && !alunoFiltro;

  return (
    <section>
      <CabecalhoPagina voltar titulo="Histórico de pagamentos" descricao={alunoEscolhido?.nome} />

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      {alunos.length > 1 && (
        <div className="filtros">
          <select className="seletor" aria-label="Aluno" value={alunoFiltro} onChange={(e) => escolherAluno(e.target.value)}>
            <option value="">{ehCoordenacao ? 'Todos os alunos' : 'Todos os dependentes'}</option>
            {alunos.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="cards">
        <Indicador
          rotulo="Total recebido"
          valor={pagamentos ? formatarMoeda(somar(visiveis)) : '–'}
          detalhe={pagamentos ? quantosPagamentos(visiveis.length) : undefined}
          compacto
        />
        {FORMAS_PAGAMENTO.map((forma) => {
          const daForma = visiveis.filter((pagamento) => pagamento.formaPagamento === forma.valor);
          return (
            <Indicador
              key={forma.valor}
              rotulo={forma.valor === 'pix' ? 'Por Pix' : 'Em dinheiro'}
              valor={pagamentos ? formatarMoeda(somar(daForma)) : '–'}
              detalhe={pagamentos ? quantosPagamentos(daForma.length) : undefined}
              compacto
            />
          );
        })}
      </div>

      {!pagamentos ? (
        !erro && (
          <div className="card">
            <Carregando linhas={4} />
          </div>
        )
      ) : visiveis.length === 0 ? (
        <div className="card">
          <Vazio icone="historico" titulo={alunoEscolhido ? `Nenhum pagamento de ${alunoEscolhido.nome}.` : 'Nenhum pagamento registrado ainda.'}>
            Os pagamentos aparecem aqui assim que a escola registra a baixa da mensalidade.
          </Vazio>
        </div>
      ) : (
        porMesDoPagamento(visiveis).map(([mes, doMes]) => (
          <article key={mes} className="card card-lista">
            <div className="card-lista-titulo">
              <h2>{nomeDoMes(mes, { maiuscula: true })}</h2>
              <span className="texto-suave">{formatarMoeda(somar(doMes))}</span>
            </div>
            <ul className="lista">
              {doMes.map((pagamento) => {
                const nome = pagamento.aluno?.nome ?? 'Aluno excluído';
                const referencia = `Mensalidade de ${nomeDoMes(pagamento.mesReferencia)}`;
                return (
                  <li key={pagamento.id}>
                    <div className="linha">
                      {mostrarAluno && (
                        <span className="avatar" aria-hidden="true">
                          {iniciais(nome)}
                        </span>
                      )}
                      <span className="linha-texto">
                        <strong>{mostrarAluno ? nome : referencia}</strong>
                        <small>
                          {[mostrarAluno && referencia, pagamento.formaPagamentoNome, `pago em ${formatarDataCompleta(pagamento.dataPagamento)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      <span className="linha-fim">{formatarMoeda(pagamento.valor)}</span>
                      <button
                        type="button"
                        className="botao-icone contorno"
                        aria-label={`Baixar recibo de ${nome}, ${nomeDoMes(pagamento.mesReferencia)}`}
                        title="Baixar recibo"
                        disabled={baixando === pagamento.id}
                        onClick={() => recibo(pagamento)}
                      >
                        <Icone nome="baixar" tamanho={18} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))
      )}
    </section>
  );
}
