/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createDadosEscolaController(servico) {
  return {
    async ver(req, res) {
      res.json(await servico(req).ver());
    },
    async atualizar(req, res) {
      res.json(await servico(req).atualizar(req.body ?? {}));
    },
  };
}
