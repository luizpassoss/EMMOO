import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { iniciais, rotuloPapel } from '../utils/format.js';
import Icone from './Icone.jsx';

/** Páginas de cada perfil, na ordem do menu (RN01–RN03). */
const LINKS = [
  { para: '/', rotulo: 'Início', icone: 'inicio', papeis: null },
  { para: '/agenda', rotulo: 'Agenda', icone: 'agenda', papeis: null },
  { para: '/aulas', rotulo: 'Aulas', icone: 'aulas', papeis: ['coordenacao', 'professor'] },
  { para: '/alunos', rotulo: 'Alunos', icone: 'alunos', papeis: ['coordenacao', 'professor'] },
  { para: '/mensalidades', rotulo: 'Mensalidades', icone: 'mensalidades', papeis: ['coordenacao', 'responsavel'] },
  { para: '/relatorios', rotulo: 'Relatórios', icone: 'relatorios', papeis: ['coordenacao'] },
  { para: '/planos', rotulo: 'Planos', icone: 'planos', papeis: null },
  { para: '/usuarios', rotulo: 'Usuários', icone: 'usuario', papeis: ['coordenacao'] },
  { para: '/escola', rotulo: 'Escola', icone: 'escola', papeis: ['coordenacao'] }, // dados da escola e Pix
];
const NO_MENU_INFERIOR = 5; // no celular, cabem 5 itens: com mais páginas, as últimas vão para "Mais"

/** Marca do app e, logo abaixo, a escola em que se está (multi-tenant: deixa claro onde os dados são gravados). */
export function Marca({ escola }) {
  return (
    <div className="marca">
      <span className="marca-icone">
        <Icone nome="nota" tamanho={24} />
      </span>
      <span className="marca-texto">
        <strong>EMMOO</strong>
        {escola && <small title={escola}>{escola}</small>}
      </span>
    </div>
  );
}

const estaEm = (pathname, para) => (para === '/' ? pathname === '/' : pathname === para || pathname.startsWith(`${para}/`));

/**
 * Estrutura das telas autenticadas (RNF04): no celular, barra superior + menu inferior (com "Mais" quando o
 * perfil tem muitas páginas); no desktop, menu lateral com todas as páginas, o usuário e o botão de sair no rodapé.
 * Tocar no próprio nome (ou nas iniciais, no celular) abre "Minha conta", onde se troca a senha.
 */
export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const links = LINKS.filter((link) => !link.papeis || link.papeis.includes(usuario?.papel));
  const comMais = links.length > NO_MENU_INFERIOR;
  const extras = comMais ? links.slice(NO_MENU_INFERIOR - 1) : [];
  const [maisAberto, setMaisAberto] = useState(false);
  const idMais = useId();
  const maisRef = useRef(null);
  const botaoMaisRef = useRef(null);

  // Navegou (inclusive pelo "voltar"): a lista do "Mais" fecha.
  useEffect(() => setMaisAberto(false), [pathname]);

  // Com a lista aberta: Esc ou tocar fora fecham; o foco volta para o botão "Mais".
  useEffect(() => {
    if (!maisAberto) return undefined;
    maisRef.current?.querySelector('a')?.focus({ preventScroll: true });
    function aoTeclar(evento) {
      if (evento.key !== 'Escape') return;
      setMaisAberto(false);
      botaoMaisRef.current?.focus();
    }
    function aoTocarFora(evento) {
      if (!maisRef.current?.contains(evento.target) && !botaoMaisRef.current?.contains(evento.target)) setMaisAberto(false);
    }
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoTocarFora);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoTocarFora);
    };
  }, [maisAberto]);

  function sair() {
    logout();
    navigate('/login', { replace: true });
  }

  const botaoSair = (
    <button type="button" className="botao-icone" onClick={sair} aria-label="Sair" title="Sair">
      <Icone nome="sair" />
    </button>
  );
  const extraAtivo = extras.some((link) => estaEm(pathname, link.para));

  return (
    <div className="app">
      <header className="topo">
        <Marca escola={usuario?.escola?.nome} />
        <div className="topo-usuario">
          <Link
            to="/perfil"
            className="avatar avatar-link"
            title={`${usuario?.nome ?? ''} · ${rotuloPapel(usuario?.papel)}`}
            aria-label="Minha conta"
          >
            {iniciais(usuario?.nome)}
          </Link>
          {botaoSair}
        </div>
      </header>

      <aside className="sidebar">
        <Marca escola={usuario?.escola?.nome} />
        <nav className="menu" aria-label="Menu principal">
          {links.map((link) => (
            <NavLink
              key={link.para}
              to={link.para}
              end={link.para === '/'}
              // No celular, as páginas de "Mais" saem da barra (continuam no menu lateral do computador).
              className={({ isActive }) =>
                `menu-item${isActive ? ' ativo' : ''}${extras.includes(link) ? ' menu-extra' : ''}`
              }
            >
              {/* No celular, a pílula atrás do ícone marca a página atual. */}
              <span className="menu-icone" aria-hidden="true">
                <Icone nome={link.icone} tamanho={22} />
              </span>
              <span className="menu-rotulo">{link.rotulo}</span>
            </NavLink>
          ))}
          {comMais && (
            <button
              ref={botaoMaisRef}
              type="button"
              className={`menu-item menu-mais-botao${extraAtivo || maisAberto ? ' ativo' : ''}`}
              aria-expanded={maisAberto}
              aria-controls={idMais}
              onClick={() => setMaisAberto((aberto) => !aberto)}
            >
              <span className="menu-icone" aria-hidden="true">
                <Icone nome="grade" tamanho={22} />
              </span>
              <span className="menu-rotulo">Mais</span>
            </button>
          )}
        </nav>
        <div className="sidebar-rodape">
          <Link to="/perfil" className="sidebar-conta" title="Minha conta">
            <span className="avatar" aria-hidden="true">
              {iniciais(usuario?.nome)}
            </span>
            <span className="sidebar-usuario">
              <strong>{usuario?.nome}</strong>
              <small>{rotuloPapel(usuario?.papel)}</small>
            </span>
          </Link>
          {botaoSair}
        </div>
      </aside>

      {maisAberto && (
        <nav ref={maisRef} id={idMais} className="menu-mais" aria-label="Mais páginas">
          {extras.map((link) => (
            <NavLink key={link.para} to={link.para} className={({ isActive }) => `menu-mais-item${isActive ? ' ativo' : ''}`}>
              <span className="indicador-icone" aria-hidden="true">
                <Icone nome={link.icone} tamanho={20} />
              </span>
              {link.rotulo}
            </NavLink>
          ))}
        </nav>
      )}

      <main className="pagina">
        <Outlet />
      </main>
    </div>
  );
}
