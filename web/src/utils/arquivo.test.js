import { afterEach, describe, expect, it, vi } from 'vitest';
import { salvarArquivo } from './arquivo.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('salvarArquivo', () => {
  it('entrega o arquivo como download, com o nome dado, e libera o endereço temporário depois', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:recibo');
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function registrar() {
      expect(this.download).toBe('recibo.pdf');
      expect(this.getAttribute('href')).toBe('blob:recibo');
      expect(document.body.contains(this)).toBe(true);
    });
    const pdf = new Blob(['%PDF']);
    salvarArquivo(pdf, 'recibo.pdf');
    expect(URL.createObjectURL).toHaveBeenCalledWith(pdf);
    expect(clique).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull(); // o link temporário já saiu da página
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recibo');
  });
});
