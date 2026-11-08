import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo from '../components/Campo.jsx';
import { Aviso, CabecalhoPagina, Carregando, Painel, useAviso, useConfirmacao, usePainel, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado, formatarContato, formatarMoeda, formatarMoedaCurta, iniciais, plural } from '../utils/format.js';

const FORM_VAZIO = { nome: '', contato: '', instrumento: '', planoId: '', usuarioRespId: '' };
const FILTROS = [
  { valor: 'ativo', rotulo: 'Ativos' },
  { valor: 'inativo', rotulo: 'Inativos' },
  { valor: '', rotulo: 'Todos' },
];

function dadosDoFormulario(aluno) {
  return {
    nome: aluno.nome,
    contato: aluno.contato,
    instrumento: aluno.instrumento,
    planoId: String(aluno.planoId),
    usuarioRespId: aluno.usuarioRespId ? String(aluno.usuarioRespId) : '',
  };
}

/** Ignora acentos e maiúsculas na busca ("violao" encontra "Violão"). */
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function AlunosPage() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.papel === 'coordenacao';
  const [alunos, setAlunos] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [busca, setBusca] = useState('');
  // Painel na URL: /alunos?aluno=novo (cadastro) ou /alunos?aluno=3 (edição) — o "voltar" fecha o painel.
  const [painel, abrirPainel, fecharPainel] = usePainel('aluno');
  const painelAberto = podeEditar && painel !== null;
  const editandoId = painelAberto && painel !== 'novo' ? Number(painel) : null;
  const alunoEditado = editandoId ? alunos.find((aluno) => aluno.id === editandoId) : null;
  const [form, setForm] = useState(FORM_VAZIO);
  const [formInicial, setFormInicial] = useState(FORM_VAZIO); // o que veio da URL: base para saber se algo mudou
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [listaAlunos, listaPlanos, listaResponsaveis] = await Promise.all([
        api.get('/alunos'),
        api.get('/planos'),
        podeEditar ? api.get('/usuarios?papel=responsavel') : Promise.resolve([]),
      ]);
      setAlunos(listaAlunos);
      setPlanos(listaPlanos);
      setResponsaveis(listaResponsaveis);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [podeEditar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O formulário segue a URL: vazio no cadastro e com os dados do aluno na edição — inclusive por link
  // direto, assim que a lista carregar. Depende só da URL e do carregamento: recarregar a lista (ex.: após
  // inativar outro aluno) não pode apagar o que a pessoa está digitando.
  useEffect(() => {
    setErrosForm({});
    if (painel === null || painel === 'novo') {
      setForm(FORM_VAZIO);
      setFormInicial(FORM_VAZIO);
      return;
    }
    if (carregando) return;
    const aluno = alunos.find((item) => String(item.id) === painel);
    if (aluno) {
      setForm(dadosDoFormulario(aluno));
      setFormInicial(dadosDoFormulario(aluno));
    }
    else fecharPainel(); // link para um aluno que não existe
  }, [painel, carregando]);

  const termo = normalizar(busca.trim());
  const visiveis = alunos.filter(
    (aluno) =>
      (!filtroStatus || aluno.status === filtroStatus) &&
      (!termo || normalizar(aluno.nome).includes(termo) || normalizar(aluno.instrumento).includes(termo)),
  );
  const contagem = (status) => alunos.filter((aluno) => !status || aluno.status === status).length;

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    const dados = {
      ...form,
      planoId: Number(form.planoId),
      usuarioRespId: form.usuarioRespId ? Number(form.usuarioRespId) : null,
    };
    try {
      if (editandoId) {
        await api.put(`/alunos/${editandoId}`, dados);
        setAviso(`Dados de ${form.nome.trim()} atualizados.`);
      } else {
        await api.post('/alunos', dados);
        setAviso(`Cadastro de ${form.nome.trim()} concluído.`);
      }
      fecharPainel();
      await carregar();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  /** Mensalidades em aberto do aluno (pendentes e atrasadas), para oferecer cancelá-las junto; sem acesso, nenhuma. */
  async function cobrancasEmAberto(aluno) {
    try {
      const todas = await api.get(`/mensalidades?mes=todos&alunoId=${aluno.id}`);
      return todas.filter((mensalidade) => mensalidade.status === 'pendente' || mensalidade.status === 'atrasada');
    } catch {
      return []; // a inativação segue sem a opção
    }
  }

  async function inativar(aluno) {
    const abertas = await cobrancasEmAberto(aluno);
    const total = abertas.reduce((soma, mensalidade) => soma + Number(mensalidade.valor), 0);
    const quais = abertas.length === 1 ? 'a mensalidade' : `as ${abertas.length} mensalidades`;
    const resposta = await confirmar({
      titulo: `Inativar ${aluno.nome}?`,
      mensagem:
        'As próximas aulas serão retiradas da agenda, os horários ficarão disponíveis e não serão geradas novas ' +
        'mensalidades. Em caso de reativação, as aulas futuras retornam à agenda, desde que o horário continue disponível.',
      acao: 'Inativar',
      // Quem saiu da escola pode ter mensalidades que não serão mais cobradas: a escola decide.
      opcao:
        abertas.length > 0
          ? {
              rotulo: `Cancelar também ${quais} em aberto (${formatarMoeda(total)})`,
              dica: abertas.length === 1 ? 'Sem marcar, ela continua em aberto.' : 'Sem marcar, elas continuam em aberto.',
            }
          : null,
    });
    if (!resposta) return;
    const cancelarMensalidades = resposta.opcao === true;
    try {
      const { aulasCanceladas = 0, mensalidadesCanceladas = 0 } = await api.patch(`/alunos/${aluno.id}/inativar`, {
        cancelarMensalidades,
      });
      const partes = [`Cadastro de ${aluno.nome} inativado.`];
      if (aulasCanceladas > 0) {
        partes.push(`${plural(aulasCanceladas, 'aula foi retirada', 'aulas foram retiradas')} da agenda e os horários ficaram disponíveis.`);
      }
      if (mensalidadesCanceladas > 0) {
        partes.push(`${plural(mensalidadesCanceladas, 'mensalidade cancelada', 'mensalidades canceladas')}.`);
      }
      setAviso(partes.join(' '));
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  /** Reativar devolve à agenda as aulas que a inativação cancelou; o aviso diz o que voltou e o que não. */
  async function reativar(aluno) {
    try {
      const { aulasRestauradas = 0, aulasNaoRestauradas = 0 } = (await api.patch(`/alunos/${aluno.id}/reativar`)) ?? {};
      const partes = [`Cadastro de ${aluno.nome} reativado.`];
      if (aulasRestauradas > 0) partes.push(`${plural(aulasRestauradas, 'aula retornou', 'aulas retornaram')} à agenda.`);
      if (aulasNaoRestauradas > 0) {
        partes.push(
          `${plural(aulasNaoRestauradas, 'horário foi ocupado', 'horários foram ocupados')} nesse período; agende novamente na Agenda.`,
        );
      }
      if (aulasRestauradas + aulasNaoRestauradas === 0) partes.push('Agende as aulas na Agenda.');
      setAviso(partes.join(' '));
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  /** Exclusão permanente (só de inativos): apaga o cadastro e todo o histórico de aulas. */
  async function excluir(aluno) {
    const confirmado = await confirmar({
      titulo: `Excluir ${aluno.nome} permanentemente?`,
      mensagem: 'O cadastro e todo o histórico de aulas serão apagados. Isso não pode ser desfeito.',
      acao: 'Excluir',
      perigo: true,
    });
    if (!confirmado) return;
    try {
      const { aulasExcluidas = 0 } = (await api.delete(`/alunos/${aluno.id}`)) ?? {};
      if (editandoId === aluno.id) fecharPainel();
      const detalhe =
        aulasExcluidas > 0 ? ` ${plural(aulasExcluidas, 'aula foi apagada', 'aulas foram apagadas')} do histórico.` : '';
      await carregar(); // a lista atualiza antes do aviso, para ele não anunciar algo ainda visível
      setAviso(`Cadastro de ${aluno.nome} excluído permanentemente.${detalhe}`);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section>
      <CabecalhoPagina titulo="Alunos">
        {podeEditar && !painelAberto && (
          <button type="button" className="botao botao-primario" onClick={() => abrirPainel('novo')}>
            <Icone nome="mais" tamanho={18} />
            Novo aluno
          </button>
        )}
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {podeEditar && painelAberto && (
        <Painel
          titulo={editandoId ? 'Editar aluno' : 'Novo aluno'}
          descricao={alunoEditado?.status === 'inativo' ? 'Cadastro inativo: sem aulas na agenda nem mensalidades novas.' : undefined}
          onFechar={fecharPainel}
          onSubmit={salvar}
          erros={errosForm}
          alterado={foiAlterado(form, formInicial)}
          acao={
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar aluno'}
            </button>
          }
          // Ações sobre a situação do aluno ficam aqui, não na lista: a lista mostra só o essencial.
          outrasAcoes={
            alunoEditado && (
              <>
                {/* RF14 — presença, diário, reposições e mensalidades do aluno. */}
                <Link to={`/alunos/${alunoEditado.id}`} className="botao botao-fantasma">
                  Ver histórico
                </Link>
                {alunoEditado.status === 'ativo' ? (
                  <button type="button" className="botao botao-fantasma" onClick={() => inativar(alunoEditado)}>
                    Inativar aluno
                  </button>
                ) : (
                  <>
                    <button type="button" className="botao botao-fantasma" onClick={() => reativar(alunoEditado)}>
                      Reativar aluno
                    </button>
                    <button type="button" className="botao botao-fantasma botao-perigo" onClick={() => excluir(alunoEditado)}>
                      Excluir permanentemente
                    </button>
                  </>
                )}
              </>
            )
          }
        >
          {errosForm.geral && (
            <p className="alerta" role="alert">
              {errosForm.geral}
            </p>
          )}
          <Campo rotulo="Nome" erro={errosForm.nome}>
            <input name="nome" autoComplete="off" value={form.nome} onChange={alterarCampo} />
          </Campo>
          <div className="grade">
            <Campo rotulo="Contato" erro={errosForm.contato}>
              <input
              name="contato"
              placeholder="Telefone ou e-mail"
              autoComplete="off"
              value={form.contato}
              onChange={alterarCampo}
              // Ao sair do campo, o telefone ganha o formato "(47) 99999-0001"; e-mail fica como foi digitado.
              onBlur={() => setForm((atual) => ({ ...atual, contato: formatarContato(atual.contato) }))}
            />
            </Campo>
            <Campo rotulo="Instrumento" erro={errosForm.instrumento}>
              <input name="instrumento" value={form.instrumento} onChange={alterarCampo} />
            </Campo>
          </div>
          <div className="grade grade-plano">
            <Campo rotulo="Plano" erro={errosForm.planoId}>
              <select name="planoId" value={form.planoId} onChange={alterarCampo}>
                <option value="">Selecione…</option>
                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {Number.isFinite(Number(plano.valor)) ? `${plano.nome} — ${formatarMoedaCurta(plano.valor)}` : plano.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              rotulo="Responsável (opcional)"
              erro={errosForm.usuarioRespId}
            >
              <select name="usuarioRespId" value={form.usuarioRespId} onChange={alterarCampo}>
                <option value="">Sem responsável</option>
                {/* Acesso desativado não entra em vínculo novo, mas o vínculo que já existe continua visível. */}
                {responsaveis
                  .filter((responsavel) => responsavel.ativo !== false || String(responsavel.id) === form.usuarioRespId)
                  .map((responsavel) => (
                    <option key={responsavel.id} value={responsavel.id}>
                      {responsavel.nome}
                    </option>
                  ))}
              </select>
            </Campo>
          </div>
        </Painel>
      )}

      <div className="filtros">
        <div className="segmentos" role="group" aria-label="Filtrar por situação">
          {FILTROS.map((filtro) => (
            <button
              key={filtro.rotulo}
              type="button"
              className={`segmento${filtroStatus === filtro.valor ? ' ativo' : ''}`}
              aria-pressed={filtroStatus === filtro.valor}
              onClick={() => setFiltroStatus(filtro.valor)}
            >
              {filtro.rotulo} <small>{contagem(filtro.valor)}</small>
            </button>
          ))}
        </div>
        <div className="busca">
          <Icone nome="busca" tamanho={18} />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Buscar por nome ou instrumento"
            aria-label="Buscar aluno"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {carregando ? (
        <div className="card">
          <Carregando linhas={4} />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card">
          <Vazio
            icone={alunos.length === 0 ? 'alunos' : 'busca'}
            titulo={alunos.length === 0 ? 'Nenhum aluno cadastrado.' : 'Nenhum aluno encontrado.'}
          />
        </div>
      ) : (
        <div className="card card-lista">
          <ul className="lista">
            {visiveis.map((aluno) => {
              const conteudo = (
                <>
                  <span className="avatar" aria-hidden="true">
                    {iniciais(aluno.nome)}
                  </span>
                  <span className="linha-texto">
                    <strong>{aluno.nome}</strong>
                    <small>{aluno.instrumento}</small>
                  </span>
                  {/* Em "Todos", o selo diferencia os inativos; nos outros filtros seria redundante. */}
                  {!filtroStatus && aluno.status === 'inativo' && <span className="pill pill-inativo">Inativo</span>}
                  <Icone nome="proximo" tamanho={18} className="linha-seta" />
                </>
              );
              return (
                <li key={aluno.id}>
                  {/* A coordenação abre o cadastro (com o histórico a um toque); o professor, o histórico (RF14). */}
                  {podeEditar ? (
                    <button type="button" className="linha" onClick={() => abrirPainel(aluno.id)}>
                      {conteudo}
                    </button>
                  ) : (
                    <Link to={`/alunos/${aluno.id}`} className="linha">
                      {conteudo}
                    </Link>
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
