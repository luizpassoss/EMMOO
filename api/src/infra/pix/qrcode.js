import QRCode from 'qrcode';

/**
 * QR Code do "Pix copia e cola", em SVG (nítido em qualquer tela e leve: alguns kB).
 * Correção de erro "M", a usada pelos bancos nos QR de Pix; margem de 2 módulos para a câmera achar as bordas.
 */
export function gerarQrCodeSvg(texto) {
  return QRCode.toString(texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}
