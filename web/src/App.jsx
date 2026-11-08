import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import AgendaPage from './pages/AgendaPage.jsx';
import AlunosPage from './pages/AlunosPage.jsx';
import AulasPage from './pages/AulasPage.jsx';
import CadastroEscolaPage from './pages/CadastroEscolaPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import EscolaPage from './pages/EscolaPage.jsx';
import HistoricoAlunoPage from './pages/HistoricoAlunoPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MensalidadesPage from './pages/MensalidadesPage.jsx';
import PagamentosPage from './pages/PagamentosPage.jsx';
import PerfilPage from './pages/PerfilPage.jsx';
import PlanosPage from './pages/PlanosPage.jsx';
import RecuperarSenhaPage from './pages/RecuperarSenhaPage.jsx';
import RedefinirSenhaPage from './pages/RedefinirSenhaPage.jsx';
import RelatoriosPage from './pages/RelatoriosPage.jsx';
import UsuariosPage from './pages/UsuariosPage.jsx';

/** Página restrita a alguns perfis (a API também confere: isto só evita mostrar o que não se pode usar). */
const so = (papeis, pagina) => <ProtectedRoute papeis={papeis}>{pagina}</ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroEscolaPage />} />
          {/* "Esqueci minha senha": pedir o link por e-mail e criar a senha nova com ele (sem sessão). */}
          <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
          <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="aulas" element={so(['coordenacao', 'professor'], <AulasPage />)} />
            <Route path="alunos" element={so(['coordenacao', 'professor'], <AlunosPage />)} />
            {/* RF14 — histórico do aluno: os três perfis (o responsável, só dos dependentes; a API restringe). */}
            <Route path="alunos/:id" element={<HistoricoAlunoPage />} />
            <Route path="mensalidades" element={so(['coordenacao', 'responsavel'], <MensalidadesPage />)} />
            <Route path="mensalidades/pagamentos" element={so(['coordenacao', 'responsavel'], <PagamentosPage />)} />
            <Route path="relatorios" element={so(['coordenacao'], <RelatoriosPage />)} />
            <Route path="planos" element={<PlanosPage />} />
            <Route path="usuarios" element={so(['coordenacao'], <UsuariosPage />)} />
            <Route path="escola" element={so(['coordenacao'], <EscolaPage />)} />
            <Route path="perfil" element={<PerfilPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
