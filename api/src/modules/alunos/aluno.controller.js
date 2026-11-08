/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createAlunoController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar({ status: req.query?.status }));
    },
    async buscar(req, res) {
      res.json(await servico(req).buscar(req.params.id));
    },
    async criar(req, res) {
      res.status(201).json(await servico(req).criar(req.body ?? {}));
    },
    async atualizar(req, res) {
      res.json(await servico(req).atualizar(req.params.id, req.body ?? {}));
    },
    async inativar(req, res) {
      res.json(await servico(req).inativar(req.params.id, req.body ?? {}));
    },
    async reativar(req, res) {
      res.json(await servico(req).reativar(req.params.id));
    },
    async excluir(req, res) {
      res.json(await servico(req).excluir(req.params.id));
    },
  };
}
