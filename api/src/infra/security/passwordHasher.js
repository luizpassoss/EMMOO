import bcrypt from 'bcryptjs';

/** Hash de senhas com bcrypt (RNF03). */
export function createPasswordHasher({ rounds = 10 } = {}) {
  return {
    hash: (senha) => bcrypt.hash(senha, rounds),
    compare: (senha, hash) => bcrypt.compare(senha, hash),
  };
}
