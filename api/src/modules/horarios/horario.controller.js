export function createHorarioController(horarioService) {
  return {
    async listar(req, res) {
      res.json(await horarioService.listar(req.query ?? {}, req.usuario));
    },
    async livres(req, res) {
      res.json(await horarioService.livres(req.query ?? {}, req.usuario));
    },
    async criar(req, res) {
      res.status(201).json(await horarioService.criar(req.body ?? {}, req.usuario));
    },
    async remover(req, res) {
      await horarioService.remover(req.params.id, req.usuario);
      res.status(204).end();
    },
  };
}
