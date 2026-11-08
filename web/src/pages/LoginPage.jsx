import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { lerEscola } from '../auth/sessao.js';
import { INICIO_DA_SESSAO } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';

/**
 * Escola já conhecida: a do link (?escola=codigo) ou a última em que se entrou neste aparelho.
 * Assim, no dia a dia, a tela pede só usuário e senha.
 */
function escolaInicial(codigoDoLink) {
  const lembrada = lerEscola();
  const codigo = codigoDoLink?.trim().toLowerCase();
  if (!codigo) return lembrada;
  return { codigo, nome: lembrada?.codigo === codigo ? lembrada.nome : null };
}

export default function LoginPage() {
  const { login, autenticado } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [conhecida] = useState(() => escolaInicial(params.get('escola')));
  const [escola, setEscola] = useState(conhecida?.codigo ?? '');
  const [trocandoEscola, setTrocandoEscola] = useState(!conhecida);
  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [recuperacao, setRecuperacao] = useState(false); // "esqueci minha senha" por e-mail disponível
  const [ajudaSenha, setAjudaSenha] = useState(false);
  // Chegou aqui porque a sessão deixou de valer (expirou ou o acesso foi desativado) ou depois de criar senha nova.
  const sessaoEncerrada = params.get('sessao') === 'encerrada';
  const senhaRedefinida = params.get('senha') === 'redefinida';

  // Após o login, volta para a página que o usuário tentou acessar.
  const destino = location.state?.from?.pathname ?? '/';

  // O link para cadastrar uma escola só aparece quando a API aceita cadastros (CADASTRO_ESCOLAS); o "esqueci minha
  // senha" leva à recuperação por e-mail quando a API tem e-mail configurado — sem ele, orienta a pedir à coordenação.
  useEffect(() => {
    let ativo = true;
    api
      .get('/escolas/configuracao')
      .then((config) => {
        if (!ativo) return;
        setCadastroAberto(Boolean(config?.cadastroDeEscolas));
        setRecuperacao(Boolean(config?.recuperacaoDeSenha));
      })
      .catch(() => {}); // sem a configuração, a tela de login segue funcionando
    return () => {
      ativo = false;
    };
  }, []);

  async function entrar(evento) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(escola.trim(), identificador.trim(), senha);
    } catch (e) {
      // Com campos vazios, a API diz quais faltam ("Informe a senha."); é mais útil que "Dados inválidos."
      const faltando = e.details?.map((detalhe) => detalhe.mensagem).join(' ');
      setErro(faltando || e.message || 'Não foi possível entrar.');
      if (e.details?.some((detalhe) => detalhe.campo === 'escola')) setTrocandoEscola(true);
      setEnviando(false);
    }
  }

  if (autenticado) return <Navigate to={destino} replace state={INICIO_DA_SESSAO} />;

  return (
    <main className="login">
      <form className="login-card" onSubmit={entrar} noValidate>
        <div className="login-marca">
          <span className="marca-icone">
            <Icone nome="nota" tamanho={40} />
          </span>
          <h1>EMMOO</h1>
          <p className="login-slogan">Gestão da escola de música</p>
        </div>

        {trocandoEscola ? (
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
                autoFocus={Boolean(conhecida)}
                onFocus={(e) => e.target.select()}
                value={escola}
                onChange={(e) => setEscola(e.target.value)}
              />
            </span>
          </label>
        ) : (
          <div className="login-escola">
            <span>
              <span className="indicador-icone" aria-hidden="true">
                <Icone nome="escola" tamanho={18} />
              </span>
              <span>
                <small>Escola</small>
                <strong>{conhecida.nome ?? conhecida.codigo}</strong>
              </span>
            </span>
            <button type="button" className="botao-link" onClick={() => setTrocandoEscola(true)}>
              Trocar
            </button>
          </div>
        )}

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
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <div className="campo-senha campo-icone">
            <Icone nome="cadeado" tamanho={18} />
            <input
              id="senha"
              type={mostrarSenha ? 'text' : 'password'}
              name="senha"
              enterKeyHint="go"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              className="botao-icone"
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={mostrarSenha}
              onClick={() => setMostrarSenha((atual) => !atual)}
            >
              <Icone nome={mostrarSenha ? 'olhoFechado' : 'olho'} tamanho={18} />
            </button>
          </div>
        </div>

        <div className="login-esqueci">
          {recuperacao ? (
            <Link to={`/recuperar-senha${escola.trim() ? `?escola=${encodeURIComponent(escola.trim().toLowerCase())}` : ''}`} className="botao-link">
              Esqueci minha senha
            </Link>
          ) : (
            <button type="button" className="botao-link" aria-expanded={ajudaSenha} onClick={() => setAjudaSenha((atual) => !atual)}>
              Esqueci minha senha
            </button>
          )}
        </div>
        {ajudaSenha && !recuperacao && (
          <p className="dica login-aviso">A coordenação da escola cria uma senha nova para você: é só pedir.</p>
        )}

        {erro ? (
          <p className="alerta" role="alert">
            {erro}
          </p>
        ) : senhaRedefinida ? (
          <p className="dica login-aviso">Senha redefinida. Entre com a senha nova.</p>
        ) : (
          sessaoEncerrada && <p className="dica login-aviso">Sua sessão foi encerrada. Entre novamente.</p>
        )}

        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      {cadastroAberto && (
        <p className="login-rodape">
          Sua escola ainda não usa o EMMOO? <Link to="/cadastro">Cadastrar escola</Link>
        </p>
      )}
    </main>
  );
}
