import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/AuthContext.jsx';
import Layout from './Layout.jsx';

const ESCOLA = { id: 1, nome: 'Escola de Música EMMOO', codigo: 'emmoo' };

function renderizar(papel, logout = vi.fn(), inicio = '/') {
  render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Mary Souza', papel, escola: ESCOLA }, logout }}>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<p>Conteúdo da página</p>} />
            <Route path="relatorios" element={<p>Página de relatórios</p>} />
            <Route path="usuarios" element={<p>Página de usuários</p>} />
            <Route path="perfil" element={<p>Minha conta</p>} />
          </Route>
          <Route path="/login" element={<p>Tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return logout;
}

const linksDoMenu = () =>
  within(screen.getByRole('navigation', { name: 'Menu principal' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('Layout', () => {
  it('coordenação: todas as páginas no menu, com a atual marcada', () => {
    renderizar('coordenacao');
    expect(linksDoMenu()).toEqual([
      'Início',
      'Agenda',
      'Aulas',
      'Alunos',
      'Mensalidades',
      'Relatórios',
      'Planos',
      'Usuários',
      'Escola',
    ]);
    expect(screen.getByRole('link', { name: 'Início' })).toHaveClass('ativo');
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
    expect(screen.getByText('Coordenação')).toBeInTheDocument();
  });

  it('no celular, o que não cabe na barra fica em "Mais"', () => {
    renderizar('coordenacao');
    // Na barra do celular: Início, Agenda, Aulas, Alunos e "Mais"; o resto só no menu lateral do computador.
    const extras = within(screen.getByRole('navigation', { name: 'Menu principal' }))
      .getAllByRole('link')
      .filter((link) => link.classList.contains('menu-extra'))
      .map((link) => link.textContent);
    expect(extras).toEqual(['Mensalidades', 'Relatórios', 'Planos', 'Usuários', 'Escola']);

    const mais = screen.getByRole('button', { name: 'Mais' });
    expect(mais).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mais);
    expect(mais).toHaveAttribute('aria-expanded', 'true');
    const lista = screen.getByRole('navigation', { name: 'Mais páginas' });
    expect(within(lista).getAllByRole('link').map((link) => link.textContent)).toEqual(extras);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Mais páginas' })).not.toBeInTheDocument();
    expect(mais).toHaveFocus();

    // Escolher uma página fecha a lista; estando nela, o "Mais" fica marcado.
    fireEvent.click(mais);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Mais páginas' })).getByRole('link', { name: 'Relatórios' }));
    expect(screen.getByText('Página de relatórios')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mais páginas' })).not.toBeInTheDocument();
    expect(mais).toHaveClass('ativo');
  });

  it('tocar fora fecha a lista do "Mais"', () => {
    renderizar('coordenacao', vi.fn(), '/usuarios');
    expect(screen.getByRole('button', { name: 'Mais' })).toHaveClass('ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    fireEvent.pointerDown(screen.getByText('Página de usuários'));
    expect(screen.queryByRole('navigation', { name: 'Mais páginas' })).not.toBeInTheDocument();
  });

  it('professor: agenda, aulas, alunos e planos — cabem na barra, sem "Mais"', () => {
    renderizar('professor');
    expect(screen.getAllByText('Escola de Música EMMOO')).toHaveLength(2); // no topo e no menu lateral
    expect(linksDoMenu()).toEqual(['Início', 'Agenda', 'Aulas', 'Alunos', 'Planos']);
    expect(screen.queryByRole('button', { name: 'Mais' })).not.toBeInTheDocument();
  });

  it('responsável: agenda, mensalidades e planos (sem alunos nem aulas da escola)', () => {
    renderizar('responsavel');
    expect(linksDoMenu()).toEqual(['Início', 'Agenda', 'Mensalidades', 'Planos']);
  });

  it('as iniciais (celular) e o nome (menu lateral) levam a "Minha conta"', () => {
    renderizar('responsavel');
    fireEvent.click(screen.getByRole('link', { name: 'Minha conta' }));
    expect(screen.getByText('Minha conta', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTitle('Minha conta')).toHaveAttribute('href', '/perfil');
  });

  it('sair encerra a sessão e volta ao login', () => {
    const logout = renderizar('professor');
    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });
});
