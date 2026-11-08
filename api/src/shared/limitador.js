/**
 * Limite de tentativas por chave (ex.: "escola|usuário" ou o IP), numa janela de tempo: depois de `maximo`
 * tentativas dentro de `janelaMs`, a chave fica bloqueada até a mais antiga sair da janela.
 * Em memória — vale para uma instância da API (o caso da escola); com várias instâncias, cada uma conta a sua.
 * `agora` é injetável para os testes.
 */
export function criarLimitador({ maximo, janelaMs, agora = () => Date.now() }) {
  const tentativas = new Map(); // chave → instantes (ms) das tentativas dentro da janela

  function recentes(chave) {
    const limite = agora() - janelaMs;
    const lista = (tentativas.get(chave) ?? []).filter((instante) => instante > limite);
    if (lista.length === 0) tentativas.delete(chave);
    else tentativas.set(chave, lista);
    return lista;
  }

  /** De tempos em tempos, esquece as chaves sem tentativas recentes (a memória não cresce sem limite). */
  function limparAntigas() {
    if (tentativas.size < 1000) return;
    for (const chave of [...tentativas.keys()]) recentes(chave);
  }

  return {
    /** Bloqueada? Devolve em quantos ms volta a liberar (0 = liberada). */
    esperaMs(chave) {
      const lista = recentes(chave);
      if (lista.length < maximo) return 0;
      return Math.max(0, lista[lista.length - maximo] + janelaMs - agora());
    },
    registrar(chave) {
      limparAntigas();
      tentativas.set(chave, [...recentes(chave), agora()]);
    },
    limpar(chave) {
      tentativas.delete(chave);
    },
  };
}

/** "Tente novamente em 12 minutos." (arredonda para cima; menos de um minuto vira "1 minuto"). */
export function mensagemDeEspera(esperaMs) {
  const minutos = Math.max(1, Math.ceil(esperaMs / 60000));
  return `Muitas tentativas. Tente novamente em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
}
