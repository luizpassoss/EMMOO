import { cloneElement, useId } from 'react';

/**
 * Rótulo + controle de formulário + mensagem de erro do campo.
 * O erro fica fora do rótulo e é ligado ao controle por aria-describedby: leitores de tela
 * anunciam "Nome" como nome do campo e a mensagem como descrição, marcando-o como inválido.
 */
export default function Campo({ rotulo, erro, children }) {
  const id = useId();
  const idErro = `${id}-erro`;
  const controle = cloneElement(children, {
    id,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? idErro : undefined,
  });
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {controle}
      {erro && (
        <small id={idErro} className="erro-campo">
          {erro}
        </small>
      )}
    </div>
  );
}
