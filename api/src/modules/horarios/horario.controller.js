/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createHorarioController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar(req.query ?? {}, req.usuario));
    },
    async livres(req, res) {
      res.json(await servico(req).livres(req.query ?? {}, req.usuario));
    },
    async criar(req, res) {
      res.status(201).json(await servico(req).criar(req.body ?? {}, req.usuario));
    },
    async criarGrade(req, res) {
      res.status(201).json(await servico(req).criarGrade(req.body ?? {}, req.usuario));
    },
    async remover(req, res) {
      await servico(req).remover(req.params.id, req.usuario);
      res.status(204).end();
    },
  };
}
