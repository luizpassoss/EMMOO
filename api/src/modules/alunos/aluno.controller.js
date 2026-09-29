export function createAlunoController(alunoService) {
  return {
    async listar(req, res) {
      res.json(await alunoService.listar({ status: req.query?.status }));
    },
    async buscar(req, res) {
      res.json(await alunoService.buscar(req.params.id));
    },
    async criar(req, res) {
      res.status(201).json(await alunoService.criar(req.body ?? {}));
    },
    async atualizar(req, res) {
      res.json(await alunoService.atualizar(req.params.id, req.body ?? {}));
    },
    async inativar(req, res) {
      res.json(await alunoService.inativar(req.params.id));
    },
    async reativar(req, res) {
      res.json(await alunoService.reativar(req.params.id));
    },
  };
}
