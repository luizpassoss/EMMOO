import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { lerEscola } from '../auth/sessao.js';
import Icone from '../components/Icone.jsx';

/**
 * "Esqueci minha senha": a pessoa informa a escola e o usuário (ou e-mail) e recebe, no e-mail cadastrado, um link
 * para criar uma senha nova. A resposta é a mesma exista ou não a pessoa — a tela não revela quem tem acesso.
 */
export default function RecuperarSenhaPage() {
  const [params] = useSearchParams();
  const [escola, setEscola] = useState(() => params.get('escola') ?? lerEscola()?.codigo ?? '');
  const [identificador, setIdentificador] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { mensagem } = await api.post('/auth/esqueci', { escola: escola.trim(), login: identificador.trim() });
      setEnviado(mensagem);
    } catch (e) {
      setErro(e.details?.map((detalhe) => detalhe.mensagem).join(' ') || e.message);
    } finally {
      setEnviando(false);
    }
  }

  const voltarAoLogin = `/login${escola.trim() ? `?escola=${encodeURIComponent(escola.trim().toLowerCase())}` : ''}`;

  return (
    <main className="login">
      <form className="login-card" onSubmit={enviar} noValidate>
        <div className="login-marca">
          <span className="marca-icone">
            <Icone nome="cadeado" tamanho={36} />
          </span>
          <h1 className="login-titulo">Esqueci minha senha</h1>
          <p className="login-slogan">Enviamos um link para você criar uma senha nova.</p>
        </div>

        {enviado ? (
          <>
            <p className="informacao" role="status">
              {enviado}
            </p>
            <p className="dica login-aviso">Não chegou? Confira a caixa de spam ou peça à coordenação da escola.</p>
            <Link to={voltarAoLogin} className="botao botao-primario">
              Voltar para o login
            </Link>
          </>
        ) : (
          <>
            <label className="campo">
              <span>Escola</span>
              <span className="campo-icone">
                <Icone nome="escola" tamanho={18} />
                <input
                  name="escola"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Código da escola"
                  value={escola}
                  onChange={(e) => setEscola(e.target.value)}
                />
              </span>
            </label>
            <label className="campo">
              <span>Usuário ou e-mail</span>
              <span className="campo-icone">
                <Icone nome="usuario" tamanho={18} />
                <input
                  name="login"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                />
              </span>
            </label>
            {erro && (
              <p className="alerta" role="alert">
                {erro}
              </p>
            )}
            <button type="submit" className="botao botao-primario" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar link'}
            </button>
          </>
        )}
      </form>
      {!enviado && (
        <p className="login-rodape">
          Lembrou a senha? <Link to={voltarAoLogin}>Voltar para o login</Link>
        </p>
      )}
    </main>
  );
}
