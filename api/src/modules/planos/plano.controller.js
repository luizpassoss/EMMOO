/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createPlanoController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar());
    },
    async criar(req, res) {
      res.status(201).json(await servico(req).criar(req.body ?? {}));
    },
    async atualizar(req, res) {
      res.json(await servico(req).atualizar(req.params.id, req.body ?? {}));
    },
    async excluir(req, res) {
      await servico(req).excluir(req.params.id);
      res.status(204).end();
    },
  };
}
