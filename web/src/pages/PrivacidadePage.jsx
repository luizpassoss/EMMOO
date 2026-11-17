import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icone from '../components/Icone.jsx';

/**
 * Aviso de privacidade (LGPD), público: quais dados o sistema guarda, para quê, quem vê e como pedir acesso,
 * correção ou exclusão. A escola é a controladora: o texto é geral e deve ser revisado por ela (ver README).
 */
export default function PrivacidadePage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Veio de outra tela do app (ex.: o login com ?escola=): voltar devolve a ela como estava, com a escola escolhida.
  // Aberto direto pelo endereço, o link leva ao login.
  const veioDoApp = location.key !== 'default';
  function voltar(evento) {
    if (!veioDoApp) return;
    evento.preventDefault();
    navigate(-1);
  }
  return (
    <main className="login">
      <article className="login-card documento">
        <div className="login-marca">
          <span className="marca-icone">
            <Icone nome="cadeado" tamanho={36} />
          </span>
          <h1>Aviso de privacidade</h1>
        </div>
        <p>
          O EMMOO é o sistema que a escola de música usa para organizar aulas, frequência e mensalidades. Este aviso explica
          quais dados pessoais ele guarda, para quê e como exercer os seus direitos, conforme a Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018).
        </p>

        <h2>Quem é responsável pelos dados</h2>
        <p>
          A escola que usa o sistema é a controladora dos dados dos seus alunos, responsáveis e equipe. Dúvidas e pedidos
          são feitos à coordenação da escola.
        </p>

        <h2>Quais dados são guardados</h2>
        <ul>
          <li>
            <strong>Alunos:</strong> nome, contato (telefone ou e-mail), instrumento, plano, aulas, presenças, faltas,
            reposições e o registro do conteúdo de cada aula.
          </li>
          <li>
            <strong>Responsáveis:</strong> nome, e-mail, os alunos de quem cuidam e as mensalidades deles.
          </li>
          <li>
            <strong>Equipe:</strong> nome, e-mail, usuário de acesso e horários de atendimento.
          </li>
          <li>
            <strong>Senhas:</strong> guardadas cifradas (hash) — ninguém, nem a escola, consegue lê-las.
          </li>
        </ul>

        <h2>Para que são usados</h2>
        <p>
          Para agendar e registrar as aulas, acompanhar a frequência, cobrar e dar recibo das mensalidades e avisar sobre
          vencimentos. Os dados não são vendidos nem usados para publicidade.
        </p>

        <h2>Crianças e adolescentes</h2>
        <p>
          Muitos alunos são menores de idade. Os dados deles são tratados no seu melhor interesse e com o consentimento de
          um dos pais ou do responsável legal, colhido pela escola na matrícula.
        </p>

        <h2>Quem tem acesso</h2>
        <p>
          Cada pessoa vê o que precisa: a coordenação gerencia a escola; o professor vê os alunos e as próprias aulas, sem
          os dados financeiros; o responsável vê apenas os seus dependentes. Os dados de uma escola nunca aparecem para
          outra. As empresas que prestam serviço ao sistema (hospedagem e envio de e-mails) tratam os dados só para isso.
        </p>

        <h2>Por quanto tempo</h2>
        <p>
          Enquanto houver vínculo com a escola. Os registros financeiros (mensalidades e recibos) são mantidos pelo prazo
          exigido pela legislação, mesmo depois do fim da matrícula.
        </p>

        <h2>Seus direitos</h2>
        <p>
          Você pode pedir à escola a confirmação e o acesso aos seus dados, a correção, a eliminação dos que não precisam
          mais ser mantidos, a portabilidade e a informação de com quem foram compartilhados, e pode revogar o
          consentimento. Os pedidos são atendidos pela coordenação da escola.
        </p>

        <h2>Segurança</h2>
        <p>
          Acesso por senha individual, conexão cifrada (HTTPS), limite de tentativas de login e encerramento imediato da
          sessão quando um acesso é desativado.
        </p>
      </article>
      <p className="login-rodape">
        <Link to="/login" onClick={voltar}>
          Voltar ao login
        </Link>
      </p>
    </main>
  );
}
