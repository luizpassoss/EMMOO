/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createAulaController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar(req.query ?? {}, req.usuario));
    },
    async detalhe(req, res) {
      res.json(await servico(req).detalhe(req.params.id, req.usuario));
    },
    async agendar(req, res) {
      res.status(201).json(await servico(req).agendar(req.body ?? {}));
    },
    async cancelar(req, res) {
      res.json(await servico(req).cancelar(req.params.id, req.usuario));
    },
    async remarcar(req, res) {
      res.json(await servico(req).remarcar(req.params.id, req.body ?? {}, req.usuario));
    },
    async avisarFalta(req, res) {
      res.json(await servico(req).avisarFalta(req.params.id, req.usuario));
    },
    async registrarPresenca(req, res) {
      res.json(await servico(req).registrarPresenca(req.params.id, req.body ?? {}, req.usuario));
    },
    async salvarDiario(req, res) {
      res.json(await servico(req).salvarDiario(req.params.id, req.body ?? {}, req.usuario));
    },
  };
}
