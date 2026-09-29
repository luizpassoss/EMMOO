export function createUsuarioController(usuarioService) {
  return {
    async listar(req, res) {
      res.json(await usuarioService.listar({ papel: req.query?.papel }));
    },
  };
}
