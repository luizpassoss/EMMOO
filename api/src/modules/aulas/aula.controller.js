export function createAulaController(aulaService) {
  return {
    async listar(req, res) {
      res.json(await aulaService.listar(req.query ?? {}, req.usuario));
    },
    async agendar(req, res) {
      res.status(201).json(await aulaService.agendar(req.body ?? {}));
    },
    async cancelar(req, res) {
      res.json(await aulaService.cancelar(req.params.id, req.usuario));
    },
  };
}
