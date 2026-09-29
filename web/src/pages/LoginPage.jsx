import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { login, autenticado } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Após o login, volta para a página que o usuário tentou acessar.
  const destino = location.state?.from?.pathname ?? '/';

  async function entrar(evento) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (e) {
      // Com campos vazios, a API diz quais faltam ("Informe o e-mail."); é mais útil que "Dados inválidos."
      const faltando = e.details?.map((detalhe) => detalhe.mensagem).join(' ');
      setErro(faltando || e.message || 'Não foi possível entrar.');
      setEnviando(false);
    }
  }

  if (autenticado) return <Navigate to={destino} replace />;

  return (
    <main className="login">
      <form className="login-card" onSubmit={entrar} noValidate>
        <div className="marca marca-grande">
          <span className="marca-icone" aria-hidden="true">♫</span>
          <h1>EMMOO</h1>
        </div>
        <p className="texto-suave">Escola de Música</p>

        <label className="campo">
          <span>E-mail</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input
            type="password"
            name="senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>

        {erro && (
          <p className="alerta" role="alert">
            {erro}
          </p>
        )}

        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
