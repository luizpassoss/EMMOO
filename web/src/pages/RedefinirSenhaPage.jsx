import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Icone from '../components/Icone.jsx';

const SENHA_MINIMA = 6; // a mesma regra da API

/**
 * Senha nova a partir do link do e-mail (?token=…). O link vale por 1 hora e uma vez só; depois de criar a senha,
 * todas as sessões abertas da pessoa terminam e ela entra de novo, já com a escola preenchida.
 */
export default function RedefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState(token ? '' : 'Este link está incompleto. Abra de novo o link do e-mail ou peça um novo.');
  const [linkInvalido, setLinkInvalido] = useState(!token);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (senha.length < SENHA_MINIMA) {
      setErro(`A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }
    setEnviando(true);
    try {
      const { escola } = await api.post('/auth/redefinir', { token, novaSenha: senha });
      logout(); // a sessão deste aparelho (se havia) deixou de valer com a senha nova
      navigate(`/login?escola=${encodeURIComponent(escola)}&senha=redefinida`, { replace: true });
    } catch (e) {
      setLinkInvalido(e.details?.some((detalhe) => detalhe.campo === 'token') ?? false);
      setErro(e.details?.map((detalhe) => detalhe.mensagem).join(' ') || e.message);
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={enviar} noValidate>
        <div className="login-marca">
          <span className="marca-icone">
            <Icone nome="cadeado" tamanho={36} />
          </span>
          <h1 className="login-titulo">Criar senha nova</h1>
          <p className="login-slogan">Depois, entre com ela em todos os aparelhos.</p>
        </div>

        {!linkInvalido && (
          <>
            <div className="campo">
              <label htmlFor="nova-senha">Nova senha</label>
              <div className="campo-senha campo-icone">
                <Icone nome="cadeado" tamanho={18} />
                <input
                  id="nova-senha"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                <button
                  type="button"
                  className="botao-icone"
                  aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={mostrar}
                  onClick={() => setMostrar((atual) => !atual)}
                >
                  <Icone nome={mostrar ? 'olhoFechado' : 'olho'} tamanho={18} />
                </button>
              </div>
              <small className="dica-campo">Pelo menos {SENHA_MINIMA} caracteres.</small>
            </div>
            <label className="campo">
              <span>Repita a nova senha</span>
              <span className="campo-icone">
                <Icone nome="cadeado" tamanho={18} />
                <input
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </span>
            </label>
          </>
        )}

        {erro && (
          <p className="alerta" role="alert">
            {erro}
          </p>
        )}

        {linkInvalido ? (
          <Link to="/recuperar-senha" className="botao botao-primario">
            Pedir um link novo
          </Link>
        ) : (
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar senha nova'}
          </button>
        )}
      </form>
      <p className="login-rodape">
        <Link to="/login">Voltar para o login</Link>
      </p>
    </main>
  );
}
