import { useEffect, useId, useRef, useState } from 'react';
import Icone from './Icone.jsx';

/**
 * Ícone de ajuda discreto ("?") ao lado de um rótulo ou título. Tocar (ou clicar, ou Enter) mostra a explicação
 * num balão, que fica até tocar de novo, tocar fora ou apertar Esc; no computador, ela também aparece enquanto
 * o mouse está sobre o ícone. Para o leitor de tela é um botão que expande (aria-expanded): a explicação vem logo
 * depois dele na leitura. O balão se posiciona em relação ao bloco do rótulo (`.campo-rotulo` ou
 * `.titulo-com-ajuda`), na largura dele.
 */
export default function Ajuda({ sobre, children }) {
  // null: fechada; 'mouse': aberta só enquanto o mouse está em cima; 'fixa': aberta por toque, clique ou teclado.
  const [modo, setModo] = useState(null);
  const raiz = useRef(null);
  const id = useId();
  const aberta = modo !== null;

  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (evento) => {
      if (!raiz.current?.contains(evento.target)) setModo(null);
    };
    const tecla = (evento) => {
      if (evento.key === 'Escape') setModo(null);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberta]);

  const doMouse = (evento) => evento.pointerType === 'mouse';
  return (
    <span
      ref={raiz}
      className="ajuda"
      onPointerEnter={(evento) => doMouse(evento) && setModo((atual) => atual ?? 'mouse')}
      onPointerLeave={(evento) => doMouse(evento) && setModo((atual) => (atual === 'mouse' ? null : atual))}
    >
      <button
        type="button"
        className="ajuda-botao"
        aria-label={`Ajuda: ${sobre}`}
        aria-expanded={aberta}
        aria-controls={aberta ? id : undefined}
        onClick={() => setModo((atual) => (atual === 'fixa' ? null : 'fixa'))}
      >
        <Icone nome="ajuda" tamanho={16} />
      </button>
      {aberta && (
        <span id={id} className="ajuda-balao">
          {children}
        </span>
      )}
    </span>
  );
}
