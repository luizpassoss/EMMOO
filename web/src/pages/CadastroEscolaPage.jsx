import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Ajuda from '../components/Ajuda.jsx';
import Campo from '../components/Campo.jsx';
import { Carregando, INICIO_DA_SESSAO, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { mapearErros } from '../utils/erros.js';

const FORM_VAZIO = { nomeEscola: '', codigo: '', nome: '', email: '', login: '', senha: '' };

/** "Escola de Música Sol" → "escola-de-musica-sol": o código sugerido, que a pessoa pode trocar. */
export function sugerirCodigo(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

const PADRAO_CODIGO = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/; // a mesma regra da API
const PAUSA_DA_CONSULTA_MS = 400;

/**
 * Enquanto a pessoa digita (ou o código acompanha o nome), pergunta à API se o código está livre — depois de uma
 * pausa, para não consultar a cada letra. Só consulta códigos no formato certo; sem resposta, nada aparece e o
 * cadastro confere ao enviar. Devolve { disponivel, mensagem? } do código atual, ou null.
 */
function useDisponibilidade(codigo, consultar) {
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    if (!consultar || !PADRAO_CODIGO.test(codigo)) return undefined;
    let ativo = true;
    const temporizador = setTimeout(() => {
      api
        .get(`/escolas/disponibilidade?codigo=${encodeURIComponent(codigo)}`)
        .then((resposta) => ativo && typeof resposta?.disponivel === 'boolean' && setResultado(resposta))
        .catch(() => {});
    }, PAUSA_DA_CONSULTA_MS);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [codigo, consultar]);
  // Uma resposta de um código anterior não vale para o que está escrito agora.
  return resultado?.codigo === codigo ? resultado : null;
}

/**
 * Cadastro de uma escola nova (multi-tenant): a escola e quem vai coordená-la.
 * Ao concluir, a pessoa já entra; professores e responsáveis ela cadastra depois, em Usuários.
 */
export default function CadastroEscolaPage() {
  const { autenticado, entrar } = useAuth();
  const [aberto, setAberto] = useState(null); // null enquanto consulta a API
  const [form, setForm] = useState(FORM_VAZIO);
  const [codigoEditado, setCodigoEditado] = useState(false);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const codigo = form.codigo.trim().toLowerCase();
  const disponibilidade = useDisponibilidade(codigo, aberto === true);

  useEffect(() => {
    let ativo = true;
    api
      .get('/escolas/configuracao')
      .then((config) => ativo && setAberto(Boolean(config?.cadastroDeEscolas)))
      .catch(() => ativo && setAberto(true)); // sem a configuração, tenta; a API recusa se estiver fechado
    return () => {
      ativo = false;
    };
  }, []);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => {
      const proximo = { ...atual, [name]: value };
      // Enquanto a pessoa não mexe no código, ele acompanha o nome da escola.
      if (name === 'nomeEscola' && !codigoEditado) proximo.codigo = sugerirCodigo(value);
      return proximo;
    });
    if (name === 'codigo') setCodigoEditado(true);
    // Código mudou: o erro do envio anterior ("já está em uso") deixa de valer; a consulta nova responde.
    if (name === 'codigo' || (name === 'nomeEscola' && !codigoEditado)) {
      setErros((atual) => {
        if (!atual.codigo) return atual;
        const { codigo: _anterior, ...resto } = atual;
        return resto;
      });
    }
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    setErros({});
    setEnviando(true);
    try {
      entrar(await api.post('/escolas', { ...form, codigo }));
    } catch (e) {
      if (e.status === 403) setAberto(false);
      setErros(e.status === 409 ? { codigo: e.message } : mapearErros(e));
      setEnviando(false);
    }
  }

  if (autenticado) return <Navigate to="/" replace state={INICIO_DA_SESSAO} />;

  // O erro do envio vem primeiro; sem ele, a consulta enquanto se digita diz se o código já tem dono.
  const erroDoCodigo = erros.codigo ?? (disponibilidade?.disponivel === false ? disponibilidade.mensagem : undefined);

  const cabecalho = (
    <div className="login-marca">
      <span className="marca-icone">
        <Icone nome="nota" tamanho={40} />
      </span>
      <h1>EMMOO</h1>
      <p className="login-slogan">Gestão da escola de música</p>
    </div>
  );
  const voltar = (
    <>
      <p className="login-rodape">
        Já possui acesso? <Link to="/login">Entrar</Link>
      </p>
      <p className="login-legal">
        <Link to="/privacidade">Aviso de privacidade</Link>
      </p>
    </>
  );

  if (aberto !== true) {
    return (
      <main className="login">
        <div className="login-card">
          {cabecalho}
          {aberto === null ? (
            <Carregando linhas={4} />
          ) : (
            <Vazio titulo="Cadastro de escolas desativado.">Entre em contato com a equipe do EMMOO para cadastrar a sua escola.</Vazio>
          )}
        </div>
        {voltar}
      </main>
    );
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={cadastrar} noValidate>
        {cabecalho}
        {erros.geral && (
          <p className="alerta" role="alert">
            {erros.geral}
          </p>
        )}

        <h2>Escola</h2>
        <Campo
          rotulo="Nome da escola"
          erro={erros.nomeEscola}
          ajuda="Aparece no menu, nos recibos e nos e-mails às famílias. Pode ser alterado depois, em Escola."
        >
          <input name="nomeEscola" autoComplete="organization" value={form.nomeEscola} onChange={alterarCampo} />
        </Campo>
        <Campo
          rotulo="Código de acesso"
          erro={erroDoCodigo}
          dica={
            disponibilidade?.disponivel && (
              <span className="dica-ok">
                <Icone nome="confirmado" tamanho={14} />
                Código disponível.
              </span>
            )
          }
          ajuda="A equipe usa este código para entrar no sistema, e ele não pode ser alterado depois. Em Escola, há um link de acesso pronto para enviar a todos."
        >
          <input
            name="codigo"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            value={form.codigo}
            onChange={alterarCampo}
          />
        </Campo>
        <span className="sr-only" aria-live="polite">
          {disponibilidade && !erros.codigo ? (disponibilidade.disponivel ? 'Código disponível.' : disponibilidade.mensagem) : ''}
        </span>

        <div className="titulo-com-ajuda">
          <h2>Seu acesso</h2>
          <Ajuda sobre="Seu acesso">
            Você entra como coordenação. Professores, responsáveis e alunos são cadastrados depois, já dentro do sistema.
          </Ajuda>
        </div>
        <Campo rotulo="Seu nome" erro={erros.nome}>
          <input name="nome" autoComplete="name" value={form.nome} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="E-mail" erro={erros.email}>
          <input name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={alterarCampo} />
        </Campo>
        <Campo
          rotulo="Usuário (opcional)"
          erro={erros.login}
          ajuda="Um nome curto para entrar sem digitar o e-mail, como admin. O e-mail continua valendo."
        >
          <input
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={form.login}
            onChange={alterarCampo}
          />
        </Campo>
        <Campo rotulo="Senha" erro={erros.senha} dica="Mínimo de 6 caracteres.">
          <input name="senha" type="password" autoComplete="new-password" value={form.senha} onChange={alterarCampo} />
        </Campo>

        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Cadastrando…' : 'Cadastrar escola'}
        </button>
      </form>
      {voltar}
    </main>
  );
}
