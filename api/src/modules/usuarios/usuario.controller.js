/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createUsuarioController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar({ papel: req.query?.papel }));
    },
    async criar(req, res) {
      res.status(201).json(await servico(req).criar(req.body ?? {}));
    },
    async atualizar(req, res) {
      res.json(await servico(req).atualizar(req.params.id, req.body ?? {}, req.usuario));
    },
    async desativar(req, res) {
      res.json(await servico(req).desativar(req.params.id, req.usuario));
    },
    async reativar(req, res) {
      res.json(await servico(req).reativar(req.params.id));
    },
  };
}
