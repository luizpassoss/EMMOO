/**
 * Envio de e-mail dos alertas de pagamento (RF12). Com SMTP_URL configurado, usa o nodemailer;
 * sem ele, o envio falha de propósito e o alerta fica pendente para reenvio — nunca se finge que foi enviado.
 * Ex.: SMTP_URL=smtps://usuario:senha@smtp.servidor.com:465
 */
export function createMailer({ smtpUrl, remetente, criarTransporte = criarTransporteSmtp }) {
  if (!smtpUrl) {
    return {
      configurado: false,
      async enviar() {
        throw new Error('Envio de e-mail não configurado (defina SMTP_URL na API).');
      },
    };
  }
  let transporte;
  return {
    configurado: true,
    async enviar({ para, assunto, texto }) {
      transporte ??= await criarTransporte(smtpUrl); // só carrega o nodemailer no primeiro envio
      await transporte.sendMail({ from: remetente, to: para, subject: assunto, text: texto });
    },
  };
}

async function criarTransporteSmtp(smtpUrl) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport(smtpUrl);
}
