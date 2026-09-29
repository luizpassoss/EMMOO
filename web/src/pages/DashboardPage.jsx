import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { horaAtual, horaFim, hojeISO, rotuloDia, somarDias } from '../utils/datas.js';
import { rotuloPapel } from '../utils/format.js';

const LIMITE_PROXIMAS = 5;

export default function DashboardPage() {
  const { usuario } = useAuth();
  const podeVerAlunos = ['coordenacao', 'professor'].includes(usuario?.papel);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const hoje = hojeISO();
      try {
        const [planos, alunos, aulas] = await Promise.all([
          api.get('/planos'),
          podeVerAlunos ? api.get('/alunos?status=ativo') : Promise.resolve(null),
          api.get(`/aulas?inicio=${hoje}&fim=${somarDias(hoje, 6)}`),
        ]);
        const agendadas = aulas.filter((aula) => aula.status === 'agendada');
        const agora = horaAtual();
        // Aula de hoje que já terminou não é "próxima"; a que está em andamento ainda aparece.
        const proximas = agendadas.filter((aula) => aula.data > hoje || horaFim(aula.hora, aula.duracaoMin) > agora);
        if (ativo) {
          setResumo({
            planos: planos.length,
            alunosAtivos: alunos ? alunos.length : null,
            aulasHoje: agendadas.filter((aula) => aula.data === hoje).length,
            proximas: proximas.slice(0, LIMITE_PROXIMAS),
          });
        }
      } catch (e) {
        if (ativo) setErro(e.message);
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [podeVerAlunos]);

  return (
    <section>
      <h1 className="titulo">Olá, {usuario?.nome}</h1>
      <p className="texto-suave">Perfil: {rotuloPapel(usuario?.papel)}</p>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      <div className="cards">
        <article className="card-indicador">
          <span>Aulas hoje</span>
          <strong>{resumo ? resumo.aulasHoje : '…'}</strong>
        </article>
        {podeVerAlunos && (
          <article className="card-indicador">
            <span>Alunos ativos</span>
            <strong>{resumo ? resumo.alunosAtivos : '…'}</strong>
          </article>
        )}
        <article className="card-indicador">
          <span>Planos cadastrados</span>
          <strong>{resumo ? resumo.planos : '…'}</strong>
        </article>
      </div>

      <article className="card">
        <div className="card-cabecalho">
          <h2>Próximas aulas</h2>
          <Link to="/agenda" className="botao botao-link">
            Ver agenda
          </Link>
        </div>
        {!resumo ? (
          <p className="texto-suave">Carregando…</p>
        ) : resumo.proximas.length === 0 ? (
          <p className="texto-suave">Nenhuma aula agendada nos próximos 7 dias.</p>
        ) : (
          <ul className="lista">
            {resumo.proximas.map((aula) => (
              <li key={aula.id} className="lista-item">
                <span className="aula-hora">{aula.hora}</span>
                <div className="lista-texto">
                  <strong>{aula.aluno?.nome ?? 'Aluno não encontrado'}</strong>
                  <small>
                    {rotuloDia(aula.data)}
                    {aula.aluno?.instrumento && ` · ${aula.aluno.instrumento}`}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h2>Em desenvolvimento</h2>
        <p className="texto-suave">
          Aviso de falta e reposições, presença com diário de aula, mensalidades e alertas de pagamento chegam nas
          próximas iterações.
        </p>
      </article>
    </section>
  );
}
