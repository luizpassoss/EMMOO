import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { hojeISO, rotuloPeriodo } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { plural } from '../utils/format.js';
import Campo from './Campo.jsx';
import { Aviso, Carregando, Painel, TituloDaSecao, useAviso, useConfirmacao, Vazio } from './Estrutura.jsx';
import Icone from './Icone.jsx';

const FORM_VAZIO = { descricao: '', inicio: '', fim: '' };
const ANOS_A_FRENTE = 2; // os mesmos da API: o ano atual e os dois seguintes

/** Marcados de início: os feriados nacionais que ainda vão acontecer e a escola não cadastrou (facultativos, não). */
const marcadosDeInicio = (feriados) =>
  new Set(feriados.filter((f) => f.tipo === 'nacional' && !f.passado && !f.jaCadastrado).map((f) => f.inicio));

/**
 * Feriados nacionais do ano de uma vez: a lista oficial (com Carnaval e Corpus Christi como pontos facultativos,
 * desmarcados) para a coordenação marcar os que a escola segue. Os que já passaram ou já estão cadastrados ficam
 * de fora. Cada um tira da agenda as aulas do dia, como no cadastro à mão.
 */
function FeriadosNacionais({ onFechar, onCadastrados }) {
  const anoAtual = Number(hojeISO().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [feriados, setFeriados] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setFeriados(null);
    setErro('');
    api
      .get(`/feriados/nacionais?ano=${ano}`)
      .then(({ feriados: lista }) => {
        if (!ativo) return;
        setFeriados(lista);
        setMarcados(marcadosDeInicio(lista));
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [ano]);

  function alternar(inicio) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(inicio)) proximo.delete(inicio);
      else proximo.add(inicio);
      return proximo;
    });
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    if (marcados.size === 0) {
      setErro('Marque pelo menos um feriado.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const resultado = await api.post('/feriados/nacionais', { ano, datas: [...marcados] });
      onCadastrados(resultado);
    } catch (e) {
      setErro(mapearErros(e).datas ?? e.message);
      setSalvando(false);
    }
  }

  const situacao = (feriado) => (feriado.jaCadastrado ? 'já cadastrado' : feriado.passado ? 'já passou' : null);
  // Primeiro os que ainda dá para marcar; depois, os que já passaram ou já estão cadastrados (cada grupo por data).
  const ordenados = feriados ? [...feriados].sort((a, b) => Number(Boolean(situacao(a))) - Number(Boolean(situacao(b)))) : null;
  return (
    <Painel
      titulo="Feriados nacionais"
      onFechar={onFechar}
      onSubmit={cadastrar}
      acao={
        <button type="submit" className="botao botao-primario" disabled={salvando || !feriados || marcados.size === 0}>
          {salvando ? 'Cadastrando…' : marcados.size > 0 ? `Cadastrar ${plural(marcados.size, 'feriado', 'feriados')}` : 'Cadastrar'}
        </button>
      }
    >
      <div className="segmentos" role="group" aria-label="Ano">
        {Array.from({ length: ANOS_A_FRENTE + 1 }, (_, indice) => anoAtual + indice).map((opcao) => (
          <button
            key={opcao}
            type="button"
            className={`segmento${opcao === ano ? ' ativo' : ''}`}
            aria-pressed={opcao === ano}
            onClick={() => setAno(opcao)}
          >
            {opcao}
          </button>
        ))}
      </div>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      {!ordenados ? (
        !erro && <Carregando linhas={6} />
      ) : (
        <ul className="lista lista-marcavel">
          {ordenados.map((feriado) => {
            const fora = situacao(feriado);
            return (
              <li key={feriado.inicio}>
                <label className={`marcavel${fora ? ' desabilitado' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={Boolean(fora)}
                    checked={!fora && marcados.has(feriado.inicio)}
                    onChange={() => alternar(feriado.inicio)}
                  />
                  <span className="linha-texto">
                    <strong>{feriado.descricao}</strong>
                    <small>
                      {rotuloPeriodo(feriado.inicio, feriado.fim)}
                      {feriado.tipo === 'facultativo' ? ' · ponto facultativo' : ''}
                      {fora ? ` · ${fora}` : ''}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}

/**
 * Feriados e recessos da escola (dias sem aula), gerenciados pela coordenação na própria agenda.
 * Cadastrar tira da agenda as aulas desses dias; remover as devolve. `onAlterado` recarrega a semana.
 */
export default function FeriadosDaEscola({ onAlterado, recolhivel = false }) {
  const [aberta, setAberta] = useState(!recolhivel); // recolhida no fim da agenda: só o título e quantos há
  const [feriados, setFeriados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(FORM_VAZIO);
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  const [nacionaisAbertos, setNacionaisAbertos] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setFeriados(await api.get('/feriados')); // de hoje em diante
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function adicionar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    try {
      const { descricao, aulasCanceladas } = await api.post('/feriados', form);
      setForm(FORM_VAZIO);
      const detalhe =
        aulasCanceladas > 0 ? ` ${plural(aulasCanceladas, 'aula foi retirada', 'aulas foram retiradas')} da agenda.` : '';
      setAviso(`${descricao} cadastrado.${detalhe}`);
      await carregar();
      onAlterado?.();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(feriado) {
    const confirmado = await confirmar({
      titulo: `Remover "${feriado.descricao}"?`,
      mensagem: 'As aulas futuras desse período retornam à agenda.',
      acao: 'Remover',
    });
    if (!confirmado) return;
    setErro('');
    try {
      const { aulasRestauradas } = await api.delete(`/feriados/${feriado.id}`);
      const detalhe =
        aulasRestauradas > 0 ? ` ${plural(aulasRestauradas, 'aula retornou', 'aulas retornaram')} à agenda.` : '';
      setAviso(`${feriado.descricao} removido.${detalhe}`);
      await carregar();
      onAlterado?.();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function aoCadastrarNacionais({ criados, aulasCanceladas }) {
    setNacionaisAbertos(false);
    const detalhe =
      aulasCanceladas > 0 ? ` ${plural(aulasCanceladas, 'aula foi retirada', 'aulas foram retiradas')} da agenda.` : '';
    setAviso(
      criados > 0
        ? `${plural(criados, 'feriado nacional cadastrado', 'feriados nacionais cadastrados')}.${detalhe}`
        : 'Os feriados escolhidos já estavam cadastrados.',
    );
    await carregar();
    onAlterado?.();
  }

  return (
    <section className="card">
      <div className="card-cabecalho">
        <TituloDaSecao
          titulo="Feriados e recessos"
          resumo={carregando ? null : feriados.length === 0 ? 'nenhum marcado' : plural(feriados.length, 'próximo', 'próximos')}
          recolhivel={recolhivel}
          aberta={aberta}
          onAlternar={() => setAberta((atual) => !atual)}
        />
        {aberta && (
          <button type="button" className="botao botao-secundario botao-compacto" onClick={() => setNacionaisAbertos(true)}>
            <Icone nome="agenda" tamanho={16} />
            Feriados nacionais
          </button>
        )}
      </div>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {aberta && (
        <>
          <div className="formulario-secao">
            {carregando ? (
              <Carregando linhas={2} />
            ) : feriados.length === 0 ? (
              <Vazio icone="agenda" titulo="Nenhum feriado ou recesso marcado." />
            ) : (
              <ul className="lista">
                {feriados.map((feriado) => (
                  <li key={feriado.id} className="lista-item feriado">
                    <span className="linha-texto">
                      <strong>{feriado.descricao}</strong>
                      <small>{rotuloPeriodo(feriado.inicio, feriado.fim)}</small>
                    </span>
                    <button
                      type="button"
                      className="botao-icone discreto"
                      aria-label={`Remover ${feriado.descricao}`}
                      title="Remover"
                      onClick={() => remover(feriado)}
                    >
                      <Icone nome="fechar" tamanho={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="formulario formulario-secao" onSubmit={adicionar} noValidate>
            {errosForm.geral && (
              <p className="alerta" role="alert">
                {errosForm.geral}
              </p>
            )}
            <div className="formulario-linha">
              <Campo rotulo="Nome" erro={errosForm.descricao}>
                <input name="descricao" placeholder="Ex.: Carnaval" autoComplete="off" value={form.descricao} onChange={alterarCampo} />
              </Campo>
              <Campo rotulo="De" erro={errosForm.inicio}>
                <input name="inicio" type="date" min={hojeISO()} value={form.inicio} onChange={alterarCampo} />
              </Campo>
              <Campo rotulo="Até (opcional)" erro={errosForm.fim}>
                <input name="fim" type="date" min={form.inicio || hojeISO()} value={form.fim} onChange={alterarCampo} />
              </Campo>
              <button type="submit" className="botao botao-secundario" disabled={salvando}>
                <Icone nome="mais" tamanho={18} />
                {salvando ? 'Adicionando…' : 'Adicionar'}
              </button>
            </div>
          </form>
        </>
      )}
      {confirmacao}
      {nacionaisAbertos && (
        <FeriadosNacionais onFechar={() => setNacionaisAbertos(false)} onCadastrados={aoCadastrarNacionais} />
      )}
    </section>
  );
}
