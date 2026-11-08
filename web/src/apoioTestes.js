import { fireEvent, screen, within } from '@testing-library/react';

/**
 * Responde à confirmação do app (o diálogo que substitui o window.confirm).
 * `esperado` ({ name, description }) confere o título e a mensagem antes de responder — depois o diálogo sai da tela.
 */
export async function responderConfirmacao(botao, esperado = {}) {
  const dialogo = await screen.findByRole('alertdialog', esperado);
  fireEvent.click(within(dialogo).getByRole('button', { name: botao }));
}
