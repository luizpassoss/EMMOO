import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/** Exige login e, opcionalmente, um dos papéis informados. */
export default function ProtectedRoute({ children, papeis }) {
  const { autenticado, usuario } = useAuth();
  const location = useLocation();

  if (!autenticado) return <Navigate to="/login" replace state={{ from: location }} />;
  if (papeis && !papeis.includes(usuario?.papel)) return <Navigate to="/" replace />;
  return children;
}
