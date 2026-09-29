import { NotFoundError, UnauthorizedError } from '../../shared/errors.js';
import { assertValid } from '../../shared/validation.js';

/** Remove dados sensíveis (hash da senha) antes de devolver o usuário. */
export function toUsuarioPublico(usuario) {
  return { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel };
}

/**
 * Caso de uso de autenticação (RF01).
 * Dependências injetadas: repositório de usuários, hasher de senha e serviço de token.
 */
export function createAuthService({ usuarios, passwordHasher, tokenService }) {
  return {
    async login(input = {}) {
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const senha = typeof input.senha === 'string' ? input.senha : '';
      const erros = [];
      if (!email) erros.push({ campo: 'email', mensagem: 'Informe o e-mail.' });
      if (!senha) erros.push({ campo: 'senha', mensagem: 'Informe a senha.' });
      assertValid(erros);

      const usuario = await usuarios.findByEmail(email);
      const senhaConfere = usuario ? await passwordHasher.compare(senha, usuario.senhaHash) : false;
      if (!senhaConfere) throw new UnauthorizedError('E-mail ou senha inválidos.');

      const token = tokenService.sign({ sub: String(usuario.id), papel: usuario.papel });
      return { token, usuario: toUsuarioPublico(usuario) };
    },

    async perfil(usuarioId) {
      const usuario = await usuarios.findById(usuarioId);
      if (!usuario) throw new NotFoundError('Usuário não encontrado.');
      return toUsuarioPublico(usuario);
    },
  };
}
