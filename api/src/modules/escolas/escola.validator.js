import { isNonEmptyString } from '../../shared/validation.js';
import { validarAcesso } from '../usuarios/usuario.validator.js';

// 3 a 40 caracteres: letras minúsculas, números e hífen, sem hífen nas pontas (vira parte do endereço de acesso).
const PADRAO_CODIGO = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** Valida o cadastro de uma escola nova com quem vai coordená-la (nome, e-mail, usuário opcional e senha). */
export function validarCadastroEscola(input = {}) {
  const erros = [];
  if (!isNonEmptyString(input.nomeEscola, 3)) {
    erros.push({ campo: 'nomeEscola', mensagem: 'Informe o nome da escola (mínimo 3 caracteres).' });
  }
  const codigo = typeof input.codigo === 'string' ? input.codigo.trim().toLowerCase() : '';
  if (!PADRAO_CODIGO.test(codigo)) {
    erros.push({ campo: 'codigo', mensagem: 'Use de 3 a 40 letras minúsculas, números ou hífen (ex.: escola-sol).' });
  }
  const acesso = validarAcesso(input, { exigirSenha: true });
  erros.push(...acesso.erros);
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { escola: { nome: input.nomeEscola.trim(), codigo }, responsavel: acesso.dados } };
}
