import { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Ajuda from '../components/Ajuda.jsx';
import Campo from '../components/Campo.jsx';
import CodigoPix from '../components/CodigoPix.jsx';
import { Aviso, CabecalhoPagina, Carregando, useAviso } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { copiarTexto } from '../utils/copiar.js';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado } from '../utils/format.js';

/** Tipos de chave Pix (os mesmos da API) e como cada uma se escreve. */
export const TIPOS_DE_CHAVE = [
  { valor: '', rotulo: 'Sem Pix por enquanto', exemplo: '' },
  { valor: 'cnpj', rotulo: 'CNPJ', exemplo: '00.000.000/0001-00' },
  { valor: 'cpf', rotulo: 'CPF', exemplo: '000.000.000-00' },
  { valor: 'telefone', rotulo: 'Celular', exemplo: '(47) 99999-0001' },
  { valor: 'email', rotulo: 'E-mail', exemplo: 'financeiro@escola.com.br' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória', exemplo: '123e4567-e89b-12d3-a456-426614174000' },
];

const doServidor = (escola) => ({
  nome: escola.nome,
  tipo: escola.pix.tipo ?? '',
  chave: escola.pix.chave ?? '',
  recebedor: escola.pix.recebedor ?? '',
  cidade: escola.pix.cidade ?? '',
});

/** Endereço de entrada com a escola já escolhida (o login aceita ?escola=): quem abre só digita usuário e senha. */
export function linkDeAcesso(codigo, origem = window.location.origin) {
  return `${origem}/login?escola=${encodeURIComponent(codigo)}`;
}

/** O link de acesso da equipe, pronto para copiar e enviar (mensagem, e-mail, grupo da escola). */
function LinkDeAcesso({ codigo }) {
  const campoRef = useRef(null);
  const [copiado, setCopiado] = useState(null); // true: copiado; false: não deu (o link fica selecionado)
  const link = linkDeAcesso(codigo);

  useEffect(() => {
    if (copiado === null) return undefined;
    const temporizador = setTimeout(() => setCopiado(null), 3000);
    return () => clearTimeout(temporizador);
  }, [copiado]);

  return (
    <div className="campo">
      <div className="campo-rotulo">
        <label htmlFor="link-de-acesso">Link de acesso da equipe</label>
        <Ajuda sobre="Link de acesso da equipe">
          Envie a professores e responsáveis: o link já abre o login com a escola escolhida, e só falta o usuário e a senha.
        </Ajuda>
      </div>
      <div className="campo-copiar">
        <input id="link-de-acesso" ref={campoRef} readOnly value={link} onFocus={(evento) => evento.target.select()} />
        <button type="button" className="botao botao-secundario" onClick={async () => setCopiado(await copiarTexto(link, campoRef.current))}>
          <Icone nome={copiado ? 'confirmado' : 'copiar'} tamanho={18} />
          {/* No celular, só o ícone: o espaço fica para o link. */}
          <span className="rotulo-opcional">{copiado ? 'Copiado' : 'Copiar'}</span>
        </button>
      </div>
      {/* Anunciado pelo leitor de tela sem disputar com o aviso da página (o "status" dela). */}
      <span className="sr-only" aria-live="polite">
        {copiado ? 'Link copiado.' : copiado === false ? 'Não foi possível copiar: o link está selecionado.' : ''}
      </span>
      {copiado === false && <small className="dica-campo">O link está selecionado: copie pelo menu do aparelho.</small>}
    </div>
  );
}

/**
 * Dados da escola (coordenação): o nome que aparece no sistema e nos recibos, e o Pix pelo qual as famílias
 * pagam as mensalidades — com um exemplo do QR para conferir no app do banco antes de divulgar.
 */
export default function EscolaPage() {
  const { token, usuario, entrar } = useAuth();
  const [escola, setEscola] = useState(null);
  const [form, setForm] = useState(null);
  const [inicial, setInicial] = useState(null);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useAviso();

  useEffect(() => {
    let ativo = true;
    api
      .get('/escola')
      .then((dados) => {
        if (!ativo) return;
        setEscola(dados);
        setForm(doServidor(dados));
        setInicial(doServidor(dados));
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function alterar(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErros({});
    try {
      const pix = form.tipo
        ? { tipo: form.tipo, chave: form.chave, recebedor: form.recebedor, cidade: form.cidade }
        : null;
      const salva = await api.put('/escola', { nome: form.nome, pix });
      setEscola(salva);
      setForm(doServidor(salva));
      setInicial(doServidor(salva));
      // O nome da escola aparece no menu: a sessão guardada neste aparelho passa a ter o nome novo.
      if (usuario?.escola && salva.nome !== usuario.escola.nome) {
        entrar({ token, usuario: { ...usuario, escola: { ...usuario.escola, nome: salva.nome } } });
      }
      setAviso(salva.pix.configurado ? 'Dados salvos. O Pix já aparece para as famílias pagarem.' : 'Dados salvos.');
    } catch (e) {
      // Os erros do Pix chegam como "pix.chave": no formulário, o campo é "chave".
      setErros(Object.fromEntries(Object.entries(mapearErros(e)).map(([campo, mensagem]) => [campo.replace(/^pix\./, ''), mensagem])));
    } finally {
      setSalvando(false);
    }
  }

  const tipo = TIPOS_DE_CHAVE.find((item) => item.valor === form?.tipo) ?? TIPOS_DE_CHAVE[0];
  return (
    <section>
      <CabecalhoPagina titulo="Escola" />
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {!form ? (
        !erro && (
          <div className="card">
            <Carregando linhas={4} />
          </div>
        )
      ) : (
        <form className="formulario" onSubmit={salvar} noValidate>
          {erros.geral && (
            <p className="alerta" role="alert">
              {erros.geral}
            </p>
          )}
          <article className="card formulario">
            <h2 className="secao-titulo">Dados da escola</h2>
            <div className="grade">
              <Campo rotulo="Nome da escola" erro={erros.nome}>
                <input name="nome" autoComplete="organization" value={form.nome} onChange={alterar} />
              </Campo>
              <Campo rotulo="Código de acesso" ajuda="A equipe usa este código para entrar. Ele não muda: assim, links e acessos já enviados continuam valendo.">
                <input value={escola.codigo} readOnly disabled />
              </Campo>
            </div>
            <LinkDeAcesso codigo={escola.codigo} />
          </article>

          <article className="card formulario">
            <div>
              <h2 className="secao-titulo">Pix para receber as mensalidades</h2>
              <p className="dica-campo">As famílias pagam pelo QR Code ou pelo “copia e cola”, já com o valor.</p>
            </div>
            <div className="grade">
              <Campo rotulo="Tipo da chave" erro={erros.tipo}>
                <select name="tipo" value={form.tipo} onChange={alterar}>
                  {TIPOS_DE_CHAVE.map((item) => (
                    <option key={item.valor} value={item.valor}>
                      {item.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              {form.tipo && (
                <Campo rotulo="Chave Pix" erro={erros.chave}>
                  <input
                    name="chave"
                    placeholder={tipo.exemplo}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode={['cpf', 'cnpj', 'telefone'].includes(form.tipo) ? 'numeric' : form.tipo === 'email' ? 'email' : 'text'}
                    value={form.chave}
                    onChange={alterar}
                  />
                </Campo>
              )}
            </div>
            {form.tipo && (
              <div className="grade">
                <Campo
                  rotulo="Nome de quem recebe (opcional)"
                  erro={erros.recebedor}
                  dica="Em branco, usa o nome da escola."
                >
                  <input name="recebedor" maxLength={60} value={form.recebedor} onChange={alterar} />
                </Campo>
                <Campo rotulo="Cidade" erro={erros.cidade} dica="Até 15 letras, sem acentos.">
                  <input name="cidade" autoComplete="address-level2" maxLength={60} value={form.cidade} onChange={alterar} />
                </Campo>
              </div>
            )}
            {escola.pix.exemplo && !foiAlterado(form, inicial) && (
              <div className="pix-exemplo">
                <p className="informacao">Leia este QR no app do banco para conferir o recebedor antes de divulgar.</p>
                <CodigoPix copiaECola={escola.pix.exemplo.copiaECola} qrCodeSvg={escola.pix.exemplo.qrCodeSvg} />
              </div>
            )}
          </article>

          <div className="botoes">
            <button type="submit" className="botao botao-primario" disabled={salvando || !foiAlterado(form, inicial)}>
              <Icone nome="confirmado" tamanho={18} />
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
