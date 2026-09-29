import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { iniciais, rotuloPapel } from '../utils/format.js';

const LINKS = [
  { para: '/', rotulo: 'Início', icone: '⌂', papeis: null },
  { para: '/agenda', rotulo: 'Agenda', icone: '◷', papeis: null },
  { para: '/alunos', rotulo: 'Alunos', icone: '♪', papeis: ['coordenacao', 'professor'] },
  { para: '/planos', rotulo: 'Planos', icone: '$', papeis: null },
];

/** Estrutura das telas autenticadas: menu lateral (desktop) / barra inferior (celular). */
export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const links = LINKS.filter((link) => !link.papeis || link.papeis.includes(usuario?.papel));

  function sair() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <span className="marca-icone" aria-hidden="true">♫</span>
          <strong>EMMOO</strong>
        </div>
        <nav className="menu" aria-label="Menu principal">
          {links.map((link) => (
            <NavLink
              key={link.para}
              to={link.para}
              end={link.para === '/'}
              className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}
            >
              <span className="menu-icone" aria-hidden="true">
                {link.icone}
              </span>
              {link.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <div className="usuario">
            <span className="avatar" aria-hidden="true">
              {iniciais(usuario?.nome)}
            </span>
            <div>
              <strong>{usuario?.nome}</strong>
              <small>{rotuloPapel(usuario?.papel)}</small>
            </div>
          </div>
          <button type="button" className="botao botao-secundario" onClick={sair}>
            Sair
          </button>
        </header>
        <main className="pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
