export function createPlanoController(planoService) {
  return {
    async listar(req, res) {
      res.json(await planoService.listar());
    },
    async criar(req, res) {
      res.status(201).json(await planoService.criar(req.body ?? {}));
    },
  };
}
