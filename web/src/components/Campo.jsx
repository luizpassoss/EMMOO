import { cloneElement, useId } from 'react';
import Ajuda from './Ajuda.jsx';

/**
 * Rótulo + controle de formulário + dica ou mensagem de erro do campo.
 * A dica e o erro ficam fora do rótulo e são ligados ao controle por aria-describedby: leitores de tela
 * anunciam "Nome" como nome do campo e o texto embaixo como descrição. Com erro, ele substitui a dica.
 * `ajuda` põe um ícone discreto ao lado do rótulo, com a explicação num balão (o que não cabe numa dica curta).
 */
export default function Campo({ rotulo, erro, dica, ajuda, children }) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  const descricao = erro ? idErro : dica ? idDica : undefined;
  const controle = cloneElement(children, {
    id,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': descricao,
  });
  const rotuloDoCampo = <label htmlFor={id}>{rotulo}</label>;
  return (
    <div className="campo">
      {ajuda ? (
        <div className="campo-rotulo">
          {rotuloDoCampo}
          <Ajuda sobre={rotulo}>{ajuda}</Ajuda>
        </div>
      ) : (
        rotuloDoCampo
      )}
      {controle}
      {erro ? (
        <small id={idErro} className="erro-campo">
          {erro}
        </small>
      ) : (
        dica && (
          <small id={idDica} className="dica-campo">
            {dica}
          </small>
        )
      )}
    </div>
  );
}

/**
 * Grupo de opções (rádio) com o visual de botões segmentados: escolha em um toque, sem abrir lista.
 * As opções dividem a largura do campo por igual, alinhadas com os outros campos do formulário.
 * `desabilitado` mantém a escolha visível sem permitir trocar (ex.: o próprio perfil).
 */
export function Opcoes({ legenda, nome, opcoes, valor, onChange, erro, dica, desabilitado = false }) {
  return (
    <fieldset className="campo" disabled={desabilitado}>
      <legend>{legenda}</legend>
      <div className="opcoes">
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className={`opcao${valor === opcao.valor ? ' ativo' : ''}`}>
            <input
              type="radio"
              className="sr-only"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              onChange={onChange}
            />
            {opcao.rotulo}
          </label>
        ))}
      </div>
      {erro ? <small className="erro-campo">{erro}</small> : dica && <small className="dica-campo">{dica}</small>}
    </fieldset>
  );
}
