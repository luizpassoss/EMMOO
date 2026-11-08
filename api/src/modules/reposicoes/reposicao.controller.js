/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createReposicaoController(servico) {
  return {
    async disponiveis(req, res) {
      res.json(await servico(req).disponiveis(req.query ?? {}, req.usuario));
    },
    async vagas(req, res) {
      res.json(await servico(req).vagas(req.params.aulaId, req.usuario));
    },
    async solicitar(req, res) {
      res.status(201).json(await servico(req).solicitar(req.body ?? {}, req.usuario));
    },
  };
}
