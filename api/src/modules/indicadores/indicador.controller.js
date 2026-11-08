/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createIndicadorController(servico) {
  return {
    async doUsuario(req, res) {
      res.json(await servico(req).doUsuario(req.usuario));
    },
  };
}
