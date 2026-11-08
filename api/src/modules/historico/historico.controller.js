/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createHistoricoController(servico) {
  return {
    async doAluno(req, res) {
      res.json(await servico(req).doAluno(req.params.id, req.usuario));
    },
  };
}
