import { isNonEmptyString, isVazio } from '../../shared/validation.js';

export const PAPEIS = ['coordenacao', 'professor', 'responsavel'];
export const SENHA_MINIMA = 6;
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PADRAO_LOGIN = /^[a-z0-9._-]{3,40}$/; // sem "@": o login decide entre usuário e e-mail por ele

/**
 * Valida os dados de acesso de uma pessoa (nome, e-mail, usuário opcional e senha).
 * `exigirSenha`: no cadastro é obrigatória; na edição, em branco mantém a senha atual.
 */
export function validarAcesso(input = {}, { exigirSenha = true } = {}) {
  const erros = [];
  if (!isNonEmptyString(input.nome, 2)) erros.push({ campo: 'nome', mensagem: 'Informe o nome (mínimo 2 caracteres).' });
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!PADRAO_EMAIL.test(email)) erros.push({ campo: 'email', mensagem: 'Informe um e-mail válido.' });
  const login = isVazio(input.login) ? null : String(input.login).trim().toLowerCase() || null;
  if (login !== null && !PADRAO_LOGIN.test(login)) {
    erros.push({ campo: 'login', mensagem: 'Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.' });
  }
  const senha = typeof input.senha === 'string' ? input.senha : '';
  if ((exigirSenha || senha) && senha.length < SENHA_MINIMA) {
    erros.push({ campo: 'senha', mensagem: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` });
  }
  return { erros, dados: { nome: String(input.nome ?? '').trim(), email, login, senha: senha || null } };
}

/** Valida um usuário da escola (RF01): acesso + papel. */
export function validarUsuario(input = {}, opcoes) {
  const { erros, dados } = validarAcesso(input, opcoes);
  if (!PAPEIS.includes(input.papel)) erros.push({ campo: 'papel', mensagem: 'Escolha o perfil.' });
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { ...dados, papel: input.papel } };
}
