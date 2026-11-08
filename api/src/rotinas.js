const UMA_HORA = 60 * 60 * 1000;

/**
 * Rotinas automáticas (RF10 e RF12), para cada escola: gera as mensalidades do mês atual (só as que faltam)
 * e processa os alertas de pagamento — a mensalidade vencida vira "atrasada" e o alerta é enviado ou fica
 * pendente para reenvio. Roda ao iniciar e depois a cada hora; o erro de uma escola não para as outras.
 */
export function iniciarRotinas({ escolas, servicosDaEscola, intervaloMs = UMA_HORA, logger = console }) {
  let rodando = false;

  async function executar() {
    if (rodando) return; // a rodada anterior ainda não terminou
    rodando = true;
    try {
      for (const escola of await escolas.list()) {
        try {
          const resultado = await servicosDaEscola(escola.id).mensalidades.rotina();
          const feito = [
            resultado.criadas && `${resultado.criadas} mensalidade(s) gerada(s)`,
            resultado.mensalidadesAtualizadas && `${resultado.mensalidadesAtualizadas} com situação atualizada`,
            resultado.alertasRegistrados && `${resultado.alertasRegistrados} alerta(s) registrado(s)`,
            resultado.enviados && `${resultado.enviados} e-mail(s) enviado(s)`,
            resultado.falhas && `${resultado.falhas} envio(s) com falha`,
          ].filter(Boolean);
          if (feito.length > 0) logger.log(`[rotinas] ${escola.codigo}: ${feito.join(', ')}.`);
        } catch (erro) {
          logger.error(`[rotinas] ${escola.codigo}: ${erro.message}`);
        }
      }
    } catch (erro) {
      logger.error(`[rotinas] ${erro.message}`);
    } finally {
      rodando = false;
    }
  }

  const primeira = executar();
  const temporizador = setInterval(executar, intervaloMs);
  temporizador.unref?.(); // não segura o processo aberto só por causa da rotina
  return { primeira, executar, parar: () => clearInterval(temporizador) };
}
