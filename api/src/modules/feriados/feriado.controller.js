/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createFeriadoController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar(req.query ?? {}));
    },
    async criar(req, res) {
      res.status(201).json(await servico(req).criar(req.body ?? {}));
    },
    async remover(req, res) {
      res.json(await servico(req).remover(req.params.id));
    },
    async nacionais(req, res) {
      res.json(await servico(req).nacionais(req.query ?? {}));
    },
    async cadastrarNacionais(req, res) {
      res.status(201).json(await servico(req).cadastrarNacionais(req.body ?? {}));
    },
  };
}
