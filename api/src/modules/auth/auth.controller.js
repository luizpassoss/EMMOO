/** Traduz HTTP ⇄ caso de uso de autenticação. O endereço (IP) entra no limite de tentativas. */
export function createAuthController(authService) {
  const origem = (req) => ({ ip: req.ip });
  return {
    async login(req, res) {
      res.json(await authService.login(req.body ?? {}, origem(req)));
    },
    async perfil(req, res) {
      res.json(await authService.perfil(req.usuario.id, req.usuario.escolaId));
    },
    async trocarSenha(req, res) {
      res.json(await authService.trocarSenha(req.usuario, req.body ?? {}));
    },
    async esqueciSenha(req, res) {
      res.json(await authService.esqueciSenha(req.body ?? {}, origem(req)));
    },
    async redefinirSenha(req, res) {
      res.json(await authService.redefinirSenha(req.body ?? {}, origem(req)));
    },
  };
}
