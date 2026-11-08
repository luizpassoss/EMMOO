/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createMensalidadeController(servico) {
  return {
    async listar(req, res) {
      res.json(await servico(req).listar(req.query ?? {}, req.usuario));
    },
    async pagamentos(req, res) {
      res.json(await servico(req).pagamentos(req.query ?? {}, req.usuario));
    },
    async gerar(req, res) {
      res.json(await servico(req).gerar(req.body ?? {}));
    },
    async registrarPagamento(req, res) {
      res.json(await servico(req).registrarPagamento(req.params.id, req.body ?? {}));
    },
    async desfazerPagamento(req, res) {
      res.json(await servico(req).desfazerPagamento(req.params.id));
    },
    async ajustarValor(req, res) {
      res.json(await servico(req).ajustarValor(req.params.id, req.body ?? {}));
    },
    async cancelar(req, res) {
      res.json(await servico(req).cancelar(req.params.id, req.body ?? {}));
    },
    async reabrir(req, res) {
      res.json(await servico(req).reabrir(req.params.id));
    },
    async pix(req, res) {
      res.json(await servico(req).pix(req.params.id, req.usuario));
    },
    async alertas(req, res) {
      res.json(await servico(req).resumoDeAlertas());
    },
    async enviarAlertas(req, res) {
      res.json(await servico(req).enviarAlertas());
    },
    /** RF15 — o PDF vai como anexo, com o nome do arquivo. */
    async recibo(req, res) {
      const { arquivo, conteudo } = await servico(req).recibo(req.params.id, req.usuario);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
      res.send(conteudo);
    },
  };
}
