import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo from '../components/Campo.jsx';
import { mapearErros } from '../utils/erros.js';
import { formatarMoeda, rotuloTipoPlano } from '../utils/format.js';

const FORM_VAZIO = { nome: '', tipo: 'particular', valor: '', freqSemanal: '1', duracaoMin: '45' };

export default function PlanosPage() {
  const { usuario } = useAuth();
  const podeCriar = usuario?.papel === 'coordenacao';
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(FORM_VAZIO);
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

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

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    setAviso('');
    try {
      await api.post('/planos', {
        ...form,
        valor: Number(form.valor),
        freqSemanal: Number(form.freqSemanal),
        duracaoMin: Number(form.duracaoMin),
      });
      setAviso(`Plano "${form.nome.trim()}" cadastrado.`);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section>
      <h1 className="titulo">Planos</h1>
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
        {carregando ? (
          <p className="texto-suave">Carregando…</p>
        ) : planos.length === 0 ? (
          <p className="texto-suave">Nenhum plano cadastrado.</p>
        ) : (
          <ul className="lista">
            {planos.map((plano) => (
              <li key={plano.id} className="lista-item">
                <div>
                  <strong>{plano.nome}</strong>
                  <small>
                    {rotuloTipoPlano(plano.tipo)} · {plano.freqSemanal}x por semana · {plano.duracaoMin} min
                  </small>
                </div>
                <span className="valor">{formatarMoeda(plano.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {podeCriar && (
        <form className="card formulario" onSubmit={salvar} noValidate>
          <h2>Novo plano</h2>
          {errosForm.geral && (
            <p className="alerta" role="alert">
              {errosForm.geral}
            </p>
          )}
          <Campo rotulo="Nome" erro={errosForm.nome}>
            <input name="nome" value={form.nome} onChange={alterarCampo} />
          </Campo>
          <div className="grade">
            <Campo rotulo="Tipo" erro={errosForm.tipo}>
              <select name="tipo" value={form.tipo} onChange={alterarCampo}>
                <option value="particular">Particular</option>
                <option value="grupo">Grupo</option>
              </select>
            </Campo>
            <Campo rotulo="Valor (R$)" erro={errosForm.valor}>
              <input name="valor" type="number" min="0" step="0.01" value={form.valor} onChange={alterarCampo} />
            </Campo>
            <Campo rotulo="Aulas por semana" erro={errosForm.freqSemanal}>
              <input name="freqSemanal" type="number" min="1" max="7" value={form.freqSemanal} onChange={alterarCampo} />
            </Campo>
            <Campo rotulo="Duração (min)" erro={errosForm.duracaoMin}>
              <input name="duracaoMin" type="number" min="15" max="240" value={form.duracaoMin} onChange={alterarCampo} />
            </Campo>
          </div>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Cadastrar plano'}
          </button>
        </form>
      )}
    </section>
  );
}
