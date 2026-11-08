export function createEscolaController(escolaService) {
  return {
    async configuracao(req, res) {
      res.json(escolaService.configuracao());
    },
    async cadastrar(req, res) {
      res.status(201).json(await escolaService.cadastrar(req.body ?? {}));
    },
  };
}
