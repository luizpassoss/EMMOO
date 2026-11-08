import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo from '../components/Campo.jsx';
import CodigoPix from '../components/CodigoPix.jsx';
import { Aviso, CabecalhoPagina, Carregando, useAviso } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
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
              <Campo rotulo="Código de acesso">
                <input value={escola.codigo} readOnly disabled />
              </Campo>
            </div>
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
