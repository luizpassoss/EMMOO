import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
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
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    setErros({});
    setEnviando(true);
    try {
      entrar(await api.post('/escolas', { ...form, codigo: form.codigo.trim().toLowerCase() }));
    } catch (e) {
      if (e.status === 403) setAberto(false);
      setErros(e.status === 409 ? { codigo: e.message } : mapearErros(e));
      setEnviando(false);
    }
  }

  if (autenticado) return <Navigate to="/" replace state={INICIO_DA_SESSAO} />;

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
    <p className="login-rodape">
      Já possui acesso? <Link to="/login">Entrar</Link>
    </p>
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
        <Campo rotulo="Nome da escola" erro={erros.nomeEscola}>
          <input name="nomeEscola" autoComplete="organization" value={form.nomeEscola} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Código de acesso" erro={erros.codigo} dica="Toda a equipe da escola usará este código para entrar.">
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

        <h2>Seu acesso</h2>
        <Campo rotulo="Seu nome" erro={erros.nome}>
          <input name="nome" autoComplete="name" value={form.nome} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="E-mail" erro={erros.email}>
          <input name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Usuário (opcional)" erro={erros.login}>
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
