import { useEffect, useRef, useState } from 'react';
import Icone from './Icone.jsx';

/** Copia o texto: pela área de transferência do navegador e, se ela não estiver disponível, selecionando o campo. */
async function copiarTexto(texto, campo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    campo?.focus();
    campo?.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  }
}

/**
 * QR Code do Pix e o "copia e cola", com o botão de copiar. No celular, quem paga copia o código e cola no app
 * do banco; no computador, lê o QR com o celular.
 */
export default function CodigoPix({ copiaECola, qrCodeSvg }) {
  const campoRef = useRef(null);
  const [copiado, setCopiado] = useState(null); // true: copiado; false: não deu (o código fica selecionado)

  useEffect(() => {
    if (copiado === null) return undefined;
    const temporizador = setTimeout(() => setCopiado(null), 3000);
    return () => clearTimeout(temporizador);
  }, [copiado]);

  async function copiar() {
    setCopiado(await copiarTexto(copiaECola, campoRef.current));
  }

  return (
    <div className="pix">
      <img
        className="pix-qr"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCodeSvg)}`}
        alt="QR Code do Pix"
        width={208}
        height={208}
      />
      <div className="pix-copia">
        <label className="pix-rotulo" htmlFor="pix-copia-e-cola">
          Pix copia e cola
        </label>
        <textarea
          id="pix-copia-e-cola"
          ref={campoRef}
          className="pix-codigo"
          readOnly
          rows={3}
          value={copiaECola}
          onFocus={(evento) => evento.target.select()}
        />
        <button type="button" className="botao botao-secundario" onClick={copiar}>
          <Icone nome={copiado ? 'confirmado' : 'copiar'} tamanho={18} />
          {copiado ? 'Código copiado' : 'Copiar código'}
        </button>
        <span className="sr-only" role="status">
          {copiado ? 'Código copiado.' : copiado === false ? 'Não foi possível copiar: o código está selecionado.' : ''}
        </span>
        {copiado === false && <small className="dica-campo">O código está selecionado: copie pelo menu do aparelho.</small>}
      </div>
    </div>
  );
}
