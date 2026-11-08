/** `servico(req)` devolve o serviço da escola de quem fez a requisição (ver middlewares/auth.js). */
export function createRelatorioController(servico) {
  return {
    async mensal(req, res) {
      res.json(await servico(req).mensal(req.query ?? {}));
    },
    /** RF15 — o PDF vai como anexo, com o nome do arquivo. */
    async pdf(req, res) {
      const { arquivo, conteudo } = await servico(req).pdf(req.query ?? {});
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
      res.send(conteudo);
    },
    /** Planilha para a contabilidade: CSV em UTF-8 (com BOM, para o Excel acertar os acentos). */
    async csv(req, res) {
      const { arquivo, conteudo } = await servico(req).csv(req.query ?? {});
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
      res.send(conteudo);
    },
  };
}
