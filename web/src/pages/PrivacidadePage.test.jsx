import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import LoginPage from './LoginPage.jsx';
import PrivacidadePage from './PrivacidadePage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn() } }));

function renderizar(endereco) {
  render(
    <AuthContext.Provider value={{ autenticado: false, login: vi.fn() }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacidade" element={<PrivacidadePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ cadastroDeEscolas: false });
});

describe('Aviso de privacidade (LGPD)', () => {
  it('o login leva ao aviso, e o aviso volta ao login como estava (com a escola do link)', async () => {
    renderizar('/login?escola=sol');
    expect(screen.getByText('sol')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Aviso de privacidade' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Aviso de privacidade' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao login' }));
    expect(screen.getByLabelText('Usuário ou e-mail')).toBeInTheDocument();
    expect(screen.getByText('sol')).toBeInTheDocument(); // a escola escolhida continua lá
  });

  it('aberto direto pelo endereço, o link leva ao login', () => {
    renderizar('/privacidade');
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao login' }));
    expect(screen.getByLabelText('Usuário ou e-mail')).toBeInTheDocument();
  });

  it('explica o que é guardado, para quê, quem vê, por quanto tempo e como pedir', () => {
    renderizar('/privacidade');
    const secoes = screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent);
    expect(secoes).toEqual([
      'Quem é responsável pelos dados',
      'Quais dados são guardados',
      'Para que são usados',
      'Crianças e adolescentes',
      'Quem tem acesso',
      'Por quanto tempo',
      'Seus direitos',
      'Segurança',
    ]);
    expect(screen.getByText(/Lei nº 13.709\/2018/)).toBeInTheDocument();
    expect(screen.getByText(/guardadas cifradas \(hash\)/)).toBeInTheDocument();
  });
});
