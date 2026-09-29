/** Traduz HTTP ⇄ caso de uso de autenticação. */
export function createAuthController(authService) {
  return {
    async login(req, res) {
      res.json(await authService.login(req.body ?? {}));
    },
    async perfil(req, res) {
      res.json(await authService.perfil(req.usuario.id));
    },
  };
}
