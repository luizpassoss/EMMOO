import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Ajuda from './Ajuda.jsx';
import Campo from './Campo.jsx';

const TEXTO = 'A equipe usa este código para entrar.';

// O jsdom não tem PointerEvent: sem ele, o evento chega sem o tipo de ponteiro (mouse, toque), que o navegador informa.
const PointerEventOriginal = window.PointerEvent;
beforeAll(() => {
  window.PointerEvent ??= class PointerEvent extends MouseEvent {
    constructor(tipo, opcoes = {}) {
      super(tipo, opcoes);
      this.pointerType = opcoes.pointerType ?? '';
    }
  };
});
afterAll(() => {
  window.PointerEvent = PointerEventOriginal;
});

function renderizar() {
  render(
    <>
      <Ajuda sobre="Código de acesso">{TEXTO}</Ajuda>
      <button type="button">Fora</button>
    </>,
  );
  return screen.getByRole('button', { name: 'Ajuda: Código de acesso' });
}

describe('Ajuda', () => {
  it('o ícone abre a explicação e diz ao leitor de tela que expandiu; tocar de novo fecha', () => {
    const botao = renderizar();
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(botao).not.toHaveAttribute('aria-controls');
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();

    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(TEXTO)).toHaveAttribute('id', botao.getAttribute('aria-controls'));

    fireEvent.click(botao);
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();
  });

  it('fecha com Esc e ao tocar fora; tocar no próprio balão não fecha', () => {
    const botao = renderizar();
    fireEvent.click(botao);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();

    fireEvent.click(botao);
    fireEvent.pointerDown(screen.getByText(TEXTO));
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fora' }));
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();
    expect(botao).toHaveAttribute('aria-expanded', 'false');
  });

  it('no computador, aparece enquanto o mouse está sobre o ícone; com um clique, fica aberta', () => {
    const botao = renderizar();
    fireEvent.pointerOver(botao, { pointerType: 'mouse' });
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
    fireEvent.pointerOut(botao, { pointerType: 'mouse' });
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();

    fireEvent.pointerOver(botao, { pointerType: 'mouse' });
    fireEvent.click(botao);
    fireEvent.pointerOut(botao, { pointerType: 'mouse' });
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
  });

  it('o toque (sem mouse) não abre por passar o dedo: só o toque no ícone', () => {
    const botao = renderizar();
    fireEvent.pointerOver(botao, { pointerType: 'touch' });
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();
  });
});

describe('Campo com ajuda', () => {
  it('o rótulo continua dando nome ao campo, e o ícone fica ao lado dele', () => {
    render(
      <Campo rotulo="Código de acesso" dica="Código disponível." ajuda={TEXTO}>
        <input />
      </Campo>,
    );
    const campo = screen.getByLabelText('Código de acesso');
    expect(campo).toHaveAccessibleDescription('Código disponível.');
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Código de acesso' }));
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
    expect(campo).toHaveAccessibleDescription('Código disponível.'); // a explicação não vira descrição do campo
  });

  it('sem ajuda, nenhum ícone', () => {
    render(
      <Campo rotulo="Nome">
        <input />
      </Campo>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
