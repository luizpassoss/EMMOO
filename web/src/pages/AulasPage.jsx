import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AulaPainel from '../components/AulaPainel.jsx';
import { Aviso, CabecalhoPagina, Carregando, useAviso, usePainel, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { horaAtual, hojeISO, rotuloDiaRelativo, somarDias } from '../utils/datas.js';
import { iniciais, rotuloStatusAula } from '../utils/format.js';

export const DIAS_DE_REGISTRO = 30; // a lista olha as aulas dos últimos 30 dias (o histórico do aluno guarda o resto)

/** Já começou? (a presença é registrada a partir do início da aula — RF08). */
const comecou = (aula, hoje, agora) => aula.data < hoje || (aula.data === hoje && aula.hora <= agora);

const FILTROS = [
  { valor: 'registrar', rotulo: 'A registrar', vazio: 'Nenhuma aula a registrar. Tudo em dia.' },
  { valor: 'diario', rotulo: 'Sem diário', vazio: 'Todas as aulas realizadas têm diário.' },
  { valor: 'registradas', rotulo: 'Registradas', vazio: 'Nenhuma aula registrada nos últimos 30 dias.' },
];
const DO_FILTRO = {
  registrar: (aula) => aula.status === 'agendada',
  diario: (aula) => aula.status === 'realizada' && !aula.temDiario,
  registradas: (aula) => aula.status === 'realizada' || aula.status === 'falta',
};

/**
 * RF08/RF09 — registro das aulas: presença ou falta e o diário (conteúdo e plano para a próxima). Mostra as aulas
 * que já começaram, dos últimos 30 dias: as que faltam registrar primeiro. O professor vê as próprias (RN02).
 */
export default function AulasPage() {
  const { usuario } = useAuth();
  const ehCoordenacao = usuario?.papel === 'coordenacao';
  const [params, setParams] = useSearchParams();
  const filtro = FILTROS.some((item) => item.valor === params.get('filtro')) ? params.get('filtro') : 'registrar';
  const [professorFiltro, setProfessorFiltro] = useState('');
  const [professores, setProfessores] = useState([]);
  const [aulas, setAulas] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useAviso();
  const [detalhe, abrirDetalhe, fecharDetalhe] = usePainel('detalhe');
  const hoje = hojeISO();

  useEffect(() => {
    let ativo = true;
    const dia = hojeISO();
    const professor = professorFiltro ? `&professorId=${professorFiltro}` : '';
    api
      .get(`/aulas?inicio=${somarDias(dia, -DIAS_DE_REGISTRO)}&fim=${dia}${professor}`)
      .then((lista) => {
        if (!ativo) return;
        setErro('');
        const agora = horaAtual();
        // A mais recente primeiro: é a que o professor acabou de dar.
        setAulas(lista.filter((aula) => comecou(aula, dia, agora)).reverse());
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [professorFiltro, versao]);

  useEffect(() => {
    if (!ehCoordenacao) return undefined;
    let ativo = true;
    api
      .get('/usuarios?papel=professor')
      .then((lista) => ativo && setProfessores(lista))
      .catch(() => ativo && setProfessores([]));
    return () => {
      ativo = false;
    };
  }, [ehCoordenacao]);

  function escolherFiltro(valor) {
    const proximos = new URLSearchParams(params);
    if (valor === 'registrar') proximos.delete('filtro');
    else proximos.set('filtro', valor);
    setParams(proximos, { replace: true });
  }

  const visiveis = (aulas ?? []).filter(DO_FILTRO[filtro]);
  const variosProfessores = professores.length > 1 && !professorFiltro;
  const vazio = FILTROS.find((item) => item.valor === filtro).vazio;

  return (
    <section>
      <CabecalhoPagina
        titulo="Aulas"
      />

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      <div className="filtros">
        <div className="segmentos" role="group" aria-label="Filtrar aulas">
          {FILTROS.map((item) => (
            <button
              key={item.valor}
              type="button"
              className={`segmento${filtro === item.valor ? ' ativo' : ''}`}
              aria-pressed={filtro === item.valor}
              onClick={() => escolherFiltro(item.valor)}
            >
              {item.rotulo} <small>{aulas ? aulas.filter(DO_FILTRO[item.valor]).length : ''}</small>
            </button>
          ))}
        </div>
        {ehCoordenacao && professores.length > 1 && (
          <select
            className="seletor"
            aria-label="Professor(a)"
            value={professorFiltro}
            onChange={(e) => setProfessorFiltro(e.target.value)}
          >
            <option value="">Todos os professores</option>
            {professores.map((professor) => (
              <option key={professor.id} value={professor.id}>
                {professor.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {!aulas ? (
        !erro && (
          <div className="card">
            <Carregando linhas={4} />
          </div>
        )
      ) : visiveis.length === 0 ? (
        <div className="card">
          <Vazio icone="aulas" titulo={vazio} />
        </div>
      ) : (
        <div className="card card-lista">
          <ul className="lista">
            {visiveis.map((aula) => {
              const nome = aula.aluno?.nome ?? 'Aluno não encontrado';
              const detalhes = [
                `${rotuloDiaRelativo(aula.data, hoje)} · ${aula.hora}`,
                variosProfessores && aula.professor && `Prof. ${aula.professor.nome}`,
                aula.reposicao && 'Reposição',
              ].filter(Boolean);
              return (
                <li key={aula.id}>
                  <button type="button" className="linha" onClick={() => abrirDetalhe(aula.id)}>
                    <span className="avatar" aria-hidden="true">
                      {iniciais(nome)}
                    </span>
                    <span className="linha-texto">
                      <strong>{nome}</strong>
                      <small>{detalhes.join(' · ')}</small>
                    </span>
                    {/* Só em "Registradas" o selo diz algo (presença ou falta); nos outros filtros, repetiria o filtro. */}
                    {filtro === 'registradas' && (
                      <span className={`pill pill-${aula.status}`}>{rotuloStatusAula(aula.status)}</span>
                    )}
                    <Icone nome="proximo" tamanho={18} className="linha-seta" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {detalhe !== null && /^\d+$/.test(detalhe) && (
        <AulaPainel
          key={detalhe}
          aulaId={Number(detalhe)}
          onFechar={fecharDetalhe}
          onConcluido={(mensagem) => {
            fecharDetalhe();
            setVersao((atual) => atual + 1);
            setAviso(mensagem);
          }}
          onAtualizada={(mensagem) => {
            setVersao((atual) => atual + 1);
            setAviso(mensagem);
          }}
        />
      )}
    </section>
  );
}
