import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/AuthContext.jsx';
import LoginPage from './LoginPage.jsx';

function renderizar(auth) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('LoginPage', () => {
  it('envia e-mail e senha informados', async () => {
    const login = vi.fn().mockResolvedValue({ nome: 'Lucimara' });
    renderizar({ autenticado: false, login });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'lucimara@emmoo.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'emmoo123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('lucimara@emmoo.com.br', 'emmoo123'));
  });

  it('mostra a mensagem de erro quando o login falha', async () => {
    const login = vi.fn().mockRejectedValue(new Error('E-mail ou senha inválidos.'));
    renderizar({ autenticado: false, login });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('diz quais campos faltam quando a API aponta detalhes', async () => {
    const login = vi.fn().mockRejectedValue({
      message: 'Dados inválidos.',
      details: [
        { campo: 'email', mensagem: 'Informe o e-mail.' },
        { campo: 'senha', mensagem: 'Informe a senha.' },
      ],
    });
    renderizar({ autenticado: false, login });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o e-mail. Informe a senha.');
  });

  it('redireciona quem já está autenticado', async () => {
    renderizar({ autenticado: true, login: vi.fn() });
    expect(await screen.findByText('Início')).toBeInTheDocument();
  });
});
