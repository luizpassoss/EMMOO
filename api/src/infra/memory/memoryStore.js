/**
 * Armazenamento em memória com ids incrementais.
 * Devolve cópias dos registros para que alterações externas não afetem o estado interno.
 */
export function createMemoryStore() {
  const registros = new Map();
  let proximoId = 1;
  const copiar = (registro) => (registro ? structuredClone(registro) : null);

  return {
    todos() {
      return [...registros.values()].map(copiar);
    },
    buscar(id) {
      return copiar(registros.get(id));
    },
    inserir(dados) {
      const agora = new Date().toISOString();
      const registro = { id: proximoId++, ...dados, criadoEm: agora, atualizadoEm: agora };
      registros.set(registro.id, registro);
      return copiar(registro);
    },
    atualizar(id, dados) {
      const atual = registros.get(id);
      if (!atual) return null;
      const registro = { ...atual, ...dados, id, atualizadoEm: new Date().toISOString() };
      registros.set(id, registro);
      return copiar(registro);
    },
    remover(id) {
      return registros.delete(id);
    },
  };
}
