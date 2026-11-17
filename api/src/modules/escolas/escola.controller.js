export function createEscolaController(escolaService) {
  // O endereço de quem chama entra nos limites das rotas públicas (cadastro e consulta do código).
  const origem = (req) => ({ ip: req.ip });
  return {
    async configuracao(req, res) {
      res.json(escolaService.configuracao());
    },
    async disponibilidade(req, res) {
      res.json(await escolaService.disponibilidade({ codigo: req.query.codigo }, origem(req)));
    },
    async cadastrar(req, res) {
      res.status(201).json(await escolaService.cadastrar(req.body ?? {}, origem(req)));
    },
  };
}
