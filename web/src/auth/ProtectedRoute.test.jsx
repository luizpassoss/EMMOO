import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthContext } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

function renderizar(auth, papeis) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/restrito']}>
        <Routes>
          <Route path="/login" element={<p>Tela de login</p>} />
          <Route path="/" element={<p>Início</p>} />
          <Route
            path="/restrito"
            element={
              <ProtectedRoute papeis={papeis}>
                <p>Conteúdo restrito</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('redireciona para o login sem autenticação', async () => {
    renderizar({ autenticado: false, usuario: null });
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
  });

  it('redireciona para o início quando o papel não tem acesso', async () => {
    renderizar({ autenticado: true, usuario: { papel: 'responsavel' } }, ['coordenacao']);
    expect(await screen.findByText('Início')).toBeInTheDocument();
  });

  it('exibe o conteúdo quando autorizado', () => {
    renderizar({ autenticado: true, usuario: { papel: 'coordenacao' } }, ['coordenacao']);
    expect(screen.getByText('Conteúdo restrito')).toBeInTheDocument();
  });
});
