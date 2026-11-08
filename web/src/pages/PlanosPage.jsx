import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo, { Opcoes } from '../components/Campo.jsx';
import { Aviso, CabecalhoPagina, Carregando, Painel, useAviso, useConfirmacao, usePainel, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado, formatarMoeda, formatarMoedaCurta, nomeSugeridoPlano, plural, rotuloTipoPlano } from '../utils/format.js';

const TIPOS = ['particular', 'grupo'];
const FREQUENCIAS = [1, 2, 3, 4, 5];
const SEMANAS_POR_MES = 4; // conta simples para a prévia; o valor cobrado é sempre o mensal
const FORM_VAZIO = { nome: '', tipo: 'particular', valor: '', freqSemanal: '1', duracaoMin: '45' };

const aulasPorMes = (freqSemanal) => Number(freqSemanal) * SEMANAS_POR_MES;
const valorPorAula = (valor, freqSemanal) => Number(valor) / aulasPorMes(freqSemanal);
// Particular antes de grupo; dentro de cada tipo, da menor para a maior frequência.
const porTipoEFrequencia = (a, b) =>
  TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo) || a.freqSemanal - b.freqSemanal || a.valor - b.valor;

/**
 * Segunda linha do item: só o que o nome ainda não diz.
 * "Particular · 1 aula por semana" → "Aulas de 45 minutos"; "Musicalização" → "Grupo · 2 aulas semanais de 50 minutos".
 */
function detalhes(plano) {
  const tipo = rotuloTipoPlano(plano.tipo);
  const citaTipo = plano.nome.toLowerCase().includes(tipo.toLowerCase());
  // A frequência conta como dita no nome em "1 aula", "2 aulas", "2 vezes" e no antigo "2x".
  const citaFrequencia = new RegExp(`\\b${plano.freqSemanal}\\s*(x|aulas?|vez|vezes)\\b`, 'i').test(plano.nome);
  const aulas = citaFrequencia
    ? `Aulas de ${plano.duracaoMin} minutos`
    : `${plural(plano.freqSemanal, 'aula semanal', 'aulas semanais')} de ${plano.duracaoMin} minutos`;
  return [!citaTipo && tipo, aulas].filter(Boolean).join(' · ');
}

function dadosDoFormulario(plano) {
  return {
    nome: plano.nome,
    tipo: plano.tipo,
    valor: String(plano.valor),
    freqSemanal: String(plano.freqSemanal),
    duracaoMin: String(plano.duracaoMin),
  };
}

/** RF03 — planos de mensalidade: tipo, frequência semanal, duração da aula e valor. */
export default function PlanosPage() {
  const { usuario } = useAuth();
  const podeGerir = usuario?.papel === 'coordenacao';
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  // Painel na URL: /planos?plano=novo (cadastro) ou /planos?plano=2 (edição) — o "voltar" fecha o painel.
  const [painel, abrirPainel, fecharPainel] = usePainel('plano');
  const painelAberto = podeGerir && painel !== null;
  const editandoId = painelAberto && painel !== 'novo' ? Number(painel) : null;
  const [form, setForm] = useState(FORM_VAZIO);
  const [formInicial, setFormInicial] = useState(FORM_VAZIO); // o que veio da URL: base para saber se algo mudou
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setPlanos(await api.get('/planos'));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O formulário segue a URL: vazio no cadastro e com os dados do plano na edição (inclusive por link direto).
  useEffect(() => {
    setErrosForm({});
    if (painel === null || painel === 'novo') {
      setForm(FORM_VAZIO);
      setFormInicial(FORM_VAZIO);
      return;
    }
    if (carregando) return;
    const plano = planos.find((item) => String(item.id) === painel);
    if (plano) {
      setForm(dadosDoFormulario(plano));
      setFormInicial(dadosDoFormulario(plano));
    }
    else fecharPainel(); // link para um plano que não existe
  }, [painel, carregando]);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    const nome = form.nome.trim() || nomeSugeridoPlano(form);
    const dados = {
      ...form,
      nome,
      valor: Number(form.valor),
      freqSemanal: Number(form.freqSemanal),
      duracaoMin: Number(form.duracaoMin),
    };
    try {
      if (editandoId) {
        await api.put(`/planos/${editandoId}`, dados);
        setAviso(`Plano "${nome}" atualizado.`);
      } else {
        await api.post('/planos', dados);
        setAviso(`Plano "${nome}" cadastrado.`);
      }
      fecharPainel();
      await carregar();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  const planoEditado = editandoId ? planos.find((plano) => plano.id === editandoId) : null;

  /** Excluir fica dentro da edição; o motivo de uma recusa (plano em uso) aparece no próprio painel. */
  async function excluir() {
    if (!planoEditado) return;
    setErrosForm({});
    // Sem alunos, confirma antes de apagar; em uso, a API explica por que não dá.
    if (planoEditado.totalAlunos === 0) {
      const confirmado = await confirmar({
        titulo: `Excluir o plano "${planoEditado.nome}"?`,
        mensagem: 'Nenhum aluno usa este plano. A exclusão não pode ser desfeita.',
        acao: 'Excluir',
        perigo: true,
      });
      if (!confirmado) return;
    }
    try {
      await api.delete(`/planos/${planoEditado.id}`);
      fecharPainel();
      await carregar(); // a lista atualiza antes do aviso, para ele não anunciar algo ainda visível
      setAviso(`Plano "${planoEditado.nome}" excluído.`);
    } catch (e) {
      setErrosForm({ geral: e.message });
    }
  }

  const frequencias = FREQUENCIAS.includes(Number(form.freqSemanal))
    ? FREQUENCIAS
    : [...FREQUENCIAS, Number(form.freqSemanal)]; // plano antigo com 6 ou 7 aulas por semana continua editável
  const previa = Number(form.valor) > 0 && Number(form.freqSemanal) > 0;
  const sugestao = nomeSugeridoPlano(form);

  return (
    <section>
      <CabecalhoPagina titulo="Planos">
        {podeGerir && !painelAberto && (
          <button type="button" className="botao botao-primario" onClick={() => abrirPainel('novo')}>
            <Icone nome="mais" tamanho={18} />
            Novo plano
          </button>
        )}
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {painelAberto && (
        <Painel
          titulo={editandoId ? 'Editar plano' : 'Novo plano'}
          onFechar={fecharPainel}
          onSubmit={salvar}
          erros={errosForm}
          alterado={foiAlterado(form, formInicial)}
          acao={
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar plano'}
            </button>
          }
          outrasAcoes={
            planoEditado && (
              <button type="button" className="botao botao-fantasma botao-perigo" onClick={excluir}>
                Excluir plano
              </button>
            )
          }
        >
          {errosForm.geral && (
            <p className="alerta" role="alert">
              {errosForm.geral}
            </p>
          )}
          <div className="grade">
            <Opcoes
              legenda="Tipo"
              nome="tipo"
              valor={form.tipo}
              onChange={alterarCampo}
              erro={errosForm.tipo}
              opcoes={TIPOS.map((tipo) => ({ valor: tipo, rotulo: rotuloTipoPlano(tipo) }))}
            />
            <Opcoes
              legenda="Aulas por semana"
              nome="freqSemanal"
              valor={form.freqSemanal}
              onChange={alterarCampo}
              erro={errosForm.freqSemanal}
              opcoes={frequencias.map((freq) => ({ valor: String(freq), rotulo: String(freq) }))}
            />
          </div>
          <div className="grade">
            <Campo
              rotulo="Valor mensal (R$)"
              erro={errosForm.valor}
              dica={previa ? `Equivale a cerca de ${formatarMoeda(valorPorAula(form.valor, form.freqSemanal))} por aula.` : undefined}
            >
              <input
                name="valor"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={alterarCampo}
              />
            </Campo>
            <Campo rotulo="Duração da aula (minutos)" erro={errosForm.duracaoMin}>
              <input name="duracaoMin" type="number" inputMode="numeric" min="15" max="240" value={form.duracaoMin} onChange={alterarCampo} />
            </Campo>
          </div>
          <Campo rotulo="Nome (opcional)" erro={errosForm.nome}>
            <input name="nome" autoComplete="off" placeholder={sugestao} value={form.nome} onChange={alterarCampo} />
          </Campo>
        </Painel>
      )}

      {carregando ? (
        <div className="card">
          <Carregando linhas={3} />
        </div>
      ) : planos.length === 0 ? (
        <div className="card">
          <Vazio icone="planos" titulo="Nenhum plano cadastrado." />
        </div>
      ) : (
        <div className="card card-lista">
          <ul className="lista">
            {[...planos].sort(porTipoEFrequencia).map((plano) => {
              const conteudo = (
                <>
                  {/* O tipo num relance: uma pessoa (particular) ou um grupo. */}
                  <span className="avatar" aria-hidden="true">
                    <Icone nome={plano.tipo === 'grupo' ? 'alunos' : 'usuario'} tamanho={20} />
                  </span>
                  <span className="linha-texto">
                    <strong>{plano.nome}</strong>
                    <small>{detalhes(plano)}</small>
                  </span>
                  <span className="linha-fim">{formatarMoedaCurta(plano.valor)}</span>
                  {podeGerir && <Icone nome="proximo" tamanho={18} className="linha-seta" />}
                </>
              );
              return (
                <li key={plano.id}>
                  {podeGerir ? (
                    <button type="button" className="linha" onClick={() => abrirPainel(plano.id)}>
                      {conteudo}
                    </button>
                  ) : (
                    <div className="linha">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {confirmacao}
    </section>
  );
}
