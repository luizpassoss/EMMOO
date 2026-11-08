import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo, { Opcoes } from '../components/Campo.jsx';
import { Aviso, CabecalhoPagina, Carregando, Painel, useAviso, useConfirmacao, usePainel, Vazio } from '../components/Estrutura.jsx';
import GradeDeHorarios, { errosDaGrade, GRADE_PADRAO, gradeParaApi } from '../components/GradeDeHorarios.jsx';
import HorariosDoProfessor from '../components/HorariosDoProfessor.jsx';
import Icone from '../components/Icone.jsx';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado, iniciais, plural, rotuloPapel } from '../utils/format.js';

const PAPEIS = ['coordenacao', 'professor', 'responsavel'];
const FORM_VAZIO = { papel: 'professor', nome: '', email: '', login: '', senha: '' };

// Ativos primeiro; depois coordenação, professores e responsáveis; dentro de cada perfil, por nome.
const porPapelENome = (a, b) =>
  Number(a.ativo === false) - Number(b.ativo === false) ||
  PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel) ||
  a.nome.localeCompare(b.nome, 'pt-BR');

const dadosDoFormulario = (usuario) => ({
  papel: usuario.papel,
  nome: usuario.nome,
  email: usuario.email,
  login: usuario.login ?? '',
  senha: '',
});

/** E-mail ou usuário repetido volta como 409 sem detalhes: a mensagem vai para o campo certo. */
function errosDaApi(erro) {
  if (erro.status === 409) return /e-mail/i.test(erro.message) ? { email: erro.message } : { login: erro.message };
  return mapearErros(erro);
}

/** RF01 — quem acessa a escola: a coordenação cadastra professores, responsáveis e outras coordenadoras. */
export default function UsuariosPage() {
  const { usuario: eu } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  // Painel na URL: /usuarios?usuario=novo ou /usuarios?usuario=3 — o "voltar" fecha o painel.
  const [painel, abrirPainel, fecharPainel] = usePainel('usuario');
  const editandoId = painel !== null && painel !== 'novo' ? Number(painel) : null;
  const [form, setForm] = useState(FORM_VAZIO);
  const [formInicial, setFormInicial] = useState(FORM_VAZIO); // o que veio da URL: base para saber se algo mudou
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Professor novo já sai com a grade de atendimento (RF04): o agendamento sugere os horários dele desde o início.
  const [grade, setGrade] = useState(GRADE_PADRAO);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setUsuarios(await api.get('/usuarios'));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O formulário segue a URL: vazio no cadastro e com os dados da pessoa na edição (inclusive por link direto).
  useEffect(() => {
    setErrosForm({});
    if (painel === null || painel === 'novo') {
      setForm(FORM_VAZIO);
      setFormInicial(FORM_VAZIO);
      setGrade(GRADE_PADRAO);
      return;
    }
    if (carregando) return;
    const usuario = usuarios.find((item) => String(item.id) === painel);
    if (usuario) {
      setForm(dadosDoFormulario(usuario));
      setFormInicial(dadosDoFormulario(usuario));
    }
    else fecharPainel(); // link para alguém que não existe (ou de outra escola)
  }, [painel, carregando]);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    const dados = { ...form, nome: form.nome.trim(), email: form.email.trim(), login: form.login.trim() };
    const comGrade = !editandoId && form.papel === 'professor' && grade.dias.length > 0;
    try {
      if (editandoId) {
        await api.put(`/usuarios/${editandoId}`, dados);
        setAviso(`Dados de ${dados.nome} atualizados.`);
      } else {
        const criado = await api.post('/usuarios', { ...dados, ...(comGrade && { horarios: gradeParaApi(grade) }) });
        setAviso(
          criado?.horariosCriados > 0
            ? `Acesso de ${dados.nome} criado, com ${plural(criado.horariosCriados, 'horário de atendimento', 'horários de atendimento')}.`
            : `Acesso de ${dados.nome} criado.`,
        );
      }
      fecharPainel();
      await carregar();
    } catch (e) {
      setErrosForm(errosDaApi(e));
    } finally {
      setSalvando(false);
    }
  }

  const editandoASiMesmo = editandoId !== null && editandoId === eu?.id;
  const gradeAlterada = !editandoId && form.papel === 'professor' && JSON.stringify(grade) !== JSON.stringify(GRADE_PADRAO);
  const usuarioEditado = editandoId !== null ? usuarios.find((usuario) => usuario.id === editandoId) : null;

  /** Desativar tira o acesso na hora (a sessão aberta termina); reativar devolve. Ninguém desativa a si mesmo. */
  async function alternarAcesso(usuario) {
    const desativar = usuario.ativo !== false;
    if (desativar) {
      const confirmado = await confirmar({
        titulo: `Desativar o acesso de ${usuario.nome}?`,
        mensagem:
          'A sessão da pessoa será encerrada imediatamente e ela não poderá mais entrar. ' +
          'O cadastro e as aulas já agendadas são mantidos, e o acesso pode ser reativado depois.',
        acao: 'Desativar',
        perigo: true,
      });
      if (!confirmado) return;
    }
    setErrosForm({});
    try {
      await api.patch(`/usuarios/${usuario.id}/${desativar ? 'desativar' : 'reativar'}`);
      fecharPainel();
      await carregar();
      setAviso(`Acesso de ${usuario.nome} ${desativar ? 'desativado' : 'reativado'}.`);
    } catch (e) {
      setErrosForm({ geral: e.message });
    }
  }

  return (
    <section>
      <CabecalhoPagina titulo="Usuários">
        {painel === null && (
          <button type="button" className="botao botao-primario" onClick={() => abrirPainel('novo')}>
            <Icone nome="mais" tamanho={18} />
            Novo usuário
          </button>
        )}
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {painel !== null && (
        <Painel
          titulo={editandoId ? 'Editar usuário' : 'Novo usuário'}
          descricao={usuarioEditado?.ativo === false ? 'Acesso desativado: a pessoa não consegue entrar.' : undefined}
          onFechar={fecharPainel}
          onSubmit={salvar}
          erros={errosForm}
          alterado={foiAlterado(form, formInicial) || gradeAlterada}
          acao={
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Criar acesso'}
            </button>
          }
          outrasAcoes={
            usuarioEditado &&
            !editandoASiMesmo && (
              <button
                type="button"
                className={`botao botao-fantasma${usuarioEditado.ativo === false ? '' : ' botao-perigo'}`}
                onClick={() => alternarAcesso(usuarioEditado)}
              >
                {usuarioEditado.ativo === false ? 'Reativar acesso' : 'Desativar acesso'}
              </button>
            )
          }
        >
          {errosForm.geral && (
            <p className="alerta" role="alert">
              {errosForm.geral}
            </p>
          )}
          <Opcoes
            legenda="Perfil"
            nome="papel"
            valor={form.papel}
            onChange={alterarCampo}
            erro={errosForm.papel}
            desabilitado={editandoASiMesmo}
            dica={editandoASiMesmo ? 'O seu próprio perfil não pode ser alterado.' : undefined}
            opcoes={PAPEIS.map((papel) => ({ valor: papel, rotulo: rotuloPapel(papel) }))}
          />
          <div className="grade">
            <Campo rotulo="Nome" erro={errosForm.nome}>
              <input name="nome" autoComplete="off" value={form.nome} onChange={alterarCampo} />
            </Campo>
            <Campo rotulo="E-mail" erro={errosForm.email}>
              <input name="email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={alterarCampo} />
            </Campo>
          </div>
          <div className="grade">
            <Campo rotulo="Usuário (opcional)" erro={errosForm.login}>
              <input
                name="login"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.login}
                onChange={alterarCampo}
              />
            </Campo>
            <Campo
              rotulo={editandoId ? 'Nova senha' : 'Senha'}
              erro={errosForm.senha}
              dica={editandoId ? 'Em branco, mantém a atual.' : 'Mínimo de 6 caracteres.'}
            >
              <input name="senha" type="password" autoComplete="new-password" value={form.senha} onChange={alterarCampo} />
            </Campo>
          </div>
          {!editandoId && form.papel === 'professor' && (
            <section className="bloco" aria-label="Horários de atendimento">
              <h3>Horários de atendimento</h3>
              <GradeDeHorarios valor={grade} onChange={setGrade} erros={errosDaGrade(errosForm)} />
            </section>
          )}
          {usuarioEditado?.papel === 'professor' && form.papel === 'professor' && (
            <HorariosDoProfessor key={usuarioEditado.id} professor={usuarioEditado} onAviso={setAviso} />
          )}
        </Painel>
      )}

      {carregando ? (
        <div className="card">
          <Carregando linhas={3} />
        </div>
      ) : usuarios.length === 0 ? (
        <div className="card">
          <Vazio icone="usuario" titulo="Nenhum usuário cadastrado." />
        </div>
      ) : (
        <div className="card card-lista">
          <ul className="lista">
            {[...usuarios].sort(porPapelENome).map((usuario) => (
              <li key={usuario.id}>
                <button
                  type="button"
                  className={`linha${usuario.ativo === false ? ' linha-inativa' : ''}`}
                  onClick={() => abrirPainel(usuario.id)}
                >
                  <span className="avatar" aria-hidden="true">
                    {iniciais(usuario.nome)}
                  </span>
                  <span className="linha-texto">
                    <strong>
                      {usuario.nome}
                      {usuario.id === eu?.id && <span className="texto-suave"> (você)</span>}
                    </strong>
                    <small>
                      {rotuloPapel(usuario.papel)} · {usuario.ativo === false ? 'acesso desativado' : (usuario.login ?? usuario.email)}
                    </small>
                  </span>
                  <Icone nome="proximo" tamanho={18} className="linha-seta" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmacao}
    </section>
  );
}
