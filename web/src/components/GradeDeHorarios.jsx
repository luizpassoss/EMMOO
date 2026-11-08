import { NOMES_DIAS } from '../utils/datas.js';
import { plural } from '../utils/format.js';
import Campo from './Campo.jsx';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo
export const DURACOES = [30, 45, 50, 60, 90];

/** Grade sugerida para professor novo: segunda a sexta, das 14:00 às 18:00, aulas de 45 minutos. */
export const GRADE_PADRAO = { dias: [1, 2, 3, 4, 5], inicio: '14:00', fim: '18:00', duracaoMin: '45' };

const paraMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const paraHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horas de início que a grade gera num dia (a mesma conta da API): aulas seguidas que terminam até o fim. */
export function horasDaGrade({ inicio, fim, duracaoMin }) {
  const duracao = Number(duracaoMin);
  if (!HORA.test(inicio ?? '') || !HORA.test(fim ?? '') || !(duracao > 0)) return [];
  const horas = [];
  for (let minuto = paraMinutos(inicio); minuto + duracao <= paraMinutos(fim); minuto += duracao) horas.push(paraHora(minuto));
  return horas;
}

/** "14:00, 14:45 e 15:30". */
const listaComE = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

/** O que a grade vai criar, numa frase — ou o que falta para ela valer. */
export function resumoDaGrade(grade) {
  if (grade.dias.length === 0) return 'Nenhum dia marcado: o professor fica sem horários por enquanto.';
  const horas = horasDaGrade(grade);
  if (horas.length === 0) return `Entre o início e o término não cabe uma aula de ${grade.duracaoMin} minutos.`;
  const total = horas.length * grade.dias.length;
  return `${plural(horas.length, 'aula', 'aulas')} por dia (${listaComE(horas)}) — ${plural(total, 'horário', 'horários')} na semana.`;
}

/**
 * RF04 — grade de atendimento do professor: dias da semana, das … às …, e a duração de cada aula.
 * Controlado: `valor` = { dias: number[], inicio, fim, duracaoMin }; `erros` com as chaves dias, inicio, fim, duracaoMin.
 */
export default function GradeDeHorarios({ valor, onChange, erros = {} }) {
  const alterar = (mudancas) => onChange({ ...valor, ...mudancas });
  function alternarDia(dia) {
    alterar({ dias: valor.dias.includes(dia) ? valor.dias.filter((item) => item !== dia) : [...valor.dias, dia] });
  }

  return (
    <div className="grade-horarios">
      <fieldset className="campo">
        <legend>Dias de atendimento</legend>
        <div className="dias-semana">
          {ORDEM_DIAS.map((dia) => {
            const marcado = valor.dias.includes(dia);
            return (
              <label key={dia} className={`dia-semana${marcado ? ' ativo' : ''}`} title={NOMES_DIAS[dia]}>
                <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternarDia(dia)} aria-label={NOMES_DIAS[dia]} />
                {NOMES_DIAS[dia].slice(0, 3)}
              </label>
            );
          })}
        </div>
        {erros.dias && <small className="erro-campo">{erros.dias}</small>}
      </fieldset>
      <div className="grade grade-horas">
        <Campo rotulo="Das" erro={erros.inicio}>
          <input type="time" value={valor.inicio} onChange={(e) => alterar({ inicio: e.target.value })} />
        </Campo>
        <Campo rotulo="Até" erro={erros.fim}>
          <input type="time" value={valor.fim} onChange={(e) => alterar({ fim: e.target.value })} />
        </Campo>
        <Campo rotulo="Cada aula" erro={erros.duracaoMin}>
          <select value={valor.duracaoMin} onChange={(e) => alterar({ duracaoMin: e.target.value })}>
            {DURACOES.map((minutos) => (
              <option key={minutos} value={minutos}>
                {minutos} min
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <p className="dica-campo grade-resumo" aria-live="polite">
        {resumoDaGrade(valor)}
      </p>
    </div>
  );
}

/** Corpo da grade para a API (dias em ordem, duração como número). */
export const gradeParaApi = (grade) => ({
  dias: [...grade.dias].sort((a, b) => a - b),
  inicio: grade.inicio,
  fim: grade.fim,
  duracaoMin: Number(grade.duracaoMin),
});

/** Erros da API da grade: no cadastro vêm como "horarios.fim"; na grade avulsa, como "fim". */
export function errosDaGrade(erros = {}) {
  return Object.fromEntries(
    Object.entries(erros)
      .filter(([campo]) => ['dias', 'inicio', 'fim', 'duracaoMin'].includes(campo.replace(/^horarios\./, '')))
      .map(([campo, mensagem]) => [campo.replace(/^horarios\./, ''), mensagem]),
  );
}
