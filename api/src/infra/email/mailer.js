/**
 * Envio de e-mail dos alertas de pagamento (RF12). Com SMTP_URL configurado, usa o nodemailer;
 * sem ele, o envio falha de propósito e o alerta fica pendente para reenvio — nunca se finge que foi enviado.
 * Ex.: SMTP_URL=smtps://usuario:senha@smtp.servidor.com:465
 */
export function createMailer({ smtpUrl, remetente, criarTransporte = criarTransporteSmtp }) {
  if (!smtpUrl) {
    const naoConfigurado = async () => {
      throw new Error('Envio de e-mail não configurado (defina SMTP_URL na API).');
    };
    return { configurado: false, enviar: naoConfigurado, verificar: naoConfigurado };
  }
  let transporte;
  const obterTransporte = async () => (transporte ??= await criarTransporte(smtpUrl)); // nodemailer só no primeiro uso
  return {
    configurado: true,
    async enviar({ para, assunto, texto }) {
      await (await obterTransporte()).sendMail({ from: remetente, to: para, subject: assunto, text: texto });
    },
    /** Conecta e faz login no servidor SMTP, sem enviar nada: confere endereço, porta e senha. */
    async verificar() {
      await (await obterTransporte()).verify();
    },
  };
}

async function criarTransporteSmtp(smtpUrl) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport(smtpUrl);
}
