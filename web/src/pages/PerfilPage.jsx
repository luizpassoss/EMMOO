import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo from '../components/Campo.jsx';
import { Aviso, CabecalhoPagina, useAviso } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { mapearErros } from '../utils/erros.js';
import { iniciais, rotuloPapel } from '../utils/format.js';

const SENHA_MINIMA = 6; // a mesma regra da API
const FORM_VAZIO = { senhaAtual: '', novaSenha: '', confirmacao: '' };

/**
 * Minha conta: os dados de acesso de quem está logado e a troca da própria senha (com a senha atual).
 * As outras sessões abertas (outro celular, outro computador) terminam; a deste aparelho continua, com o token novo.
 */
export default function PerfilPage() {
  const { usuario, entrar, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState({});
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useAviso(7000);

  function alterar(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function trocarSenha(evento) {
    evento.preventDefault();
    const locais = {};
    if (!form.senhaAtual) locais.senhaAtual = 'Informe a senha atual.';
    if (form.novaSenha.length < SENHA_MINIMA) locais.novaSenha = `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
    else if (form.confirmacao !== form.novaSenha) locais.confirmacao = 'As duas senhas não são iguais.';
    setErros(locais);
    if (Object.keys(locais).length > 0) return;
    setSalvando(true);
    try {
      const sessao = await api.put('/auth/senha', { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha });
      entrar(sessao); // o token antigo deixou de valer: este aparelho segue com o novo
      setForm(FORM_VAZIO);
      setAviso('Senha alterada. Nos outros aparelhos, será preciso entrar de novo com a senha nova.');
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  function sair() {
    logout();
    navigate('/login', { replace: true });
  }

  const tipoSenha = mostrar ? 'text' : 'password';
  return (
    <section>
      <CabecalhoPagina voltar titulo="Minha conta" />
      <Aviso>{aviso}</Aviso>

      <article className="card conta">
        <span className="avatar avatar-grande" aria-hidden="true">
          {iniciais(usuario?.nome)}
        </span>
        <div className="linha-texto">
          <strong>{usuario?.nome}</strong>
          <small>
            {rotuloPapel(usuario?.papel)}
            {usuario?.escola?.nome ? ` · ${usuario.escola.nome}` : ''}
          </small>
        </div>
        <dl className="detalhes conta-detalhes">
          <div>
            <dt>E-mail</dt>
            <dd>{usuario?.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Usuário</dt>
            <dd>{usuario?.login || '— (entra com o e-mail)'}</dd>
          </div>
          <div>
            <dt>Código da escola</dt>
            <dd>{usuario?.escola?.codigo ?? '—'}</dd>
          </div>
        </dl>
      </article>

      <article className="card">
        <h2 className="secao-titulo">Trocar senha</h2>
        <form className="formulario" onSubmit={trocarSenha} noValidate>
          {erros.geral && (
            <p className="alerta" role="alert">
              {erros.geral}
            </p>
          )}
          <div className="grade">
            <Campo rotulo="Senha atual" erro={erros.senhaAtual}>
              <input name="senhaAtual" type={tipoSenha} autoComplete="current-password" value={form.senhaAtual} onChange={alterar} />
            </Campo>
            <Campo rotulo="Nova senha" erro={erros.novaSenha} dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
              <input name="novaSenha" type={tipoSenha} autoComplete="new-password" value={form.novaSenha} onChange={alterar} />
            </Campo>
            <Campo rotulo="Repita a nova senha" erro={erros.confirmacao}>
              <input name="confirmacao" type={tipoSenha} autoComplete="new-password" value={form.confirmacao} onChange={alterar} />
            </Campo>
          </div>
          <label className="marcar">
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
            Mostrar as senhas
          </label>
          <div className="botoes">
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              <Icone nome="cadeado" tamanho={18} />
              {salvando ? 'Salvando…' : 'Trocar senha'}
            </button>
          </div>
        </form>
      </article>

      <button type="button" className="botao botao-secundario conta-sair" onClick={sair}>
        <Icone nome="sair" tamanho={18} />
        Sair do sistema
      </button>
    </section>
  );
}
