import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo from '../components/Campo.jsx';
import { mapearErros } from '../utils/erros.js';
import { iniciais, plural } from '../utils/format.js';

const FORM_VAZIO = { nome: '', contato: '', instrumento: '', planoId: '', usuarioRespId: '' };
const FILTROS = [
  { valor: 'ativo', rotulo: 'Ativos' },
  { valor: 'inativo', rotulo: 'Inativos' },
  { valor: '', rotulo: 'Todos' },
];

/** Ignora acentos e maiúsculas na busca ("violao" encontra "Violão"). */
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function AlunosPage() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.papel === 'coordenacao';
  const [alunos, setAlunos] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const formRef = useRef(null);

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

  function descricao(aluno) {
    const plano = planos.find((item) => item.id === aluno.planoId)?.nome ?? '—';
    const responsavel = responsaveis.find((item) => item.id === aluno.usuarioRespId)?.nome;
    return [aluno.instrumento, plano, responsavel && `Resp.: ${responsavel}`].filter(Boolean).join(' · ');
  }

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

  function editar(aluno) {
    setEditandoId(aluno.id);
    setErrosForm({});
    setAviso('');
    setForm({
      nome: aluno.nome,
      contato: aluno.contato,
      instrumento: aluno.instrumento,
      planoId: String(aluno.planoId),
      usuarioRespId: aluno.usuarioRespId ? String(aluno.usuarioRespId) : '',
    });
    // O formulário fica abaixo da lista: leva o usuário até ele.
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    formRef.current?.elements.nome.focus({ preventScroll: true });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setErrosForm({});
    setForm(FORM_VAZIO);
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    setAviso('');
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
        setAviso(`${form.nome.trim()} cadastrado(a).`);
      }
      setEditandoId(null);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  async function inativar(aluno) {
    const mensagem = `Inativar ${aluno.nome}? As aulas futuras serão canceladas e não haverá novas mensalidades.`;
    if (!window.confirm(mensagem)) return;
    setAviso('');
    try {
      const { aulasCanceladas = 0 } = await api.patch(`/alunos/${aluno.id}/inativar`);
      const detalhe = aulasCanceladas > 0 ? ` ${plural(aulasCanceladas, 'aula futura cancelada', 'aulas futuras canceladas')}.` : '';
      setAviso(`${aluno.nome} inativado(a).${detalhe}`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function reativar(aluno) {
    setAviso('');
    try {
      await api.patch(`/alunos/${aluno.id}/reativar`);
      setAviso(`${aluno.nome} reativado(a). Agende as aulas na Agenda.`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section>
      <h1 className="titulo">Alunos</h1>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="aviso" role="status">
          {aviso}
        </p>
      )}

      <div className="card">
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
          <input
            type="search"
            className="busca"
            placeholder="Buscar por nome ou instrumento"
            aria-label="Buscar aluno"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {carregando ? (
          <p className="texto-suave">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="texto-suave">{alunos.length === 0 ? 'Nenhum aluno cadastrado.' : 'Nenhum aluno encontrado.'}</p>
        ) : (
          <ul className="lista">
            {visiveis.map((aluno) => (
              <li key={aluno.id} className="lista-item">
                <span className="avatar" aria-hidden="true">
                  {iniciais(aluno.nome)}
                </span>
                <div className="lista-texto">
                  <strong>{aluno.nome}</strong>
                  <small>{descricao(aluno)}</small>
                </div>
                <span className={`pill pill-${aluno.status}`}>{aluno.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                {podeEditar && (
                  <div className="acoes">
                    <button type="button" className="botao botao-link" onClick={() => editar(aluno)}>
                      Editar
                    </button>
                    {aluno.status === 'ativo' ? (
                      <button type="button" className="botao botao-link" onClick={() => inativar(aluno)}>
                        Inativar
                      </button>
                    ) : (
                      <button type="button" className="botao botao-link" onClick={() => reativar(aluno)}>
                        Reativar
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {podeEditar && (
        <form ref={formRef} className="card formulario" onSubmit={salvar} noValidate>
          <h2>{editandoId ? 'Editar aluno' : 'Novo aluno'}</h2>
          {errosForm.geral && (
            <p className="alerta" role="alert">
              {errosForm.geral}
            </p>
          )}
          <Campo rotulo="Nome" erro={errosForm.nome}>
            <input name="nome" value={form.nome} onChange={alterarCampo} />
          </Campo>
          <div className="grade">
            <Campo rotulo="Contato (telefone ou e-mail)" erro={errosForm.contato}>
              <input name="contato" value={form.contato} onChange={alterarCampo} />
            </Campo>
            <Campo rotulo="Instrumento" erro={errosForm.instrumento}>
              <input name="instrumento" value={form.instrumento} onChange={alterarCampo} />
            </Campo>
          </div>
          <div className="grade">
            <Campo rotulo="Plano" erro={errosForm.planoId}>
              <select name="planoId" value={form.planoId} onChange={alterarCampo}>
                <option value="">Selecione…</option>
                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {plano.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Responsável (opcional)" erro={errosForm.usuarioRespId}>
              <select name="usuarioRespId" value={form.usuarioRespId} onChange={alterarCampo}>
                <option value="">Sem responsável</option>
                {responsaveis.map((responsavel) => (
                  <option key={responsavel.id} value={responsavel.id}>
                    {responsavel.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="botoes">
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar aluno'}
            </button>
            {editandoId && (
              <button type="button" className="botao botao-secundario" onClick={cancelarEdicao}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
