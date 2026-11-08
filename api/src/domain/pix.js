/**
 * Pix da escola — regras puras: validação da chave e o "Pix copia e cola" (BR Code estático, no padrão EMV
 * do Banco Central), com o valor da mensalidade. O mesmo texto vira o QR que o app do banco lê.
 */
export const TIPOS_DE_CHAVE = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  telefone: 'Telefone',
  email: 'E-mail',
  aleatoria: 'Chave aleatória',
};
export const RECEBEDOR_MAXIMO = 25; // limites do BR Code
export const CIDADE_MAXIMA = 15;

const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');
const repetido = (digitos) => /^(\d)\1+$/.test(digitos);

/** Dígito verificador de CPF/CNPJ: soma ponderada módulo 11. */
function digito(numeros, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + Number(numeros[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || repetido(d)) return false;
  const primeiro = digito(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(d[9]) && segundo === Number(d[10]);
}

export function cnpjValido(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || repetido(d)) return false;
  const primeiro = digito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(d[12]) && segundo === Number(d[13]);
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Chave no formato que o Pix usa: CPF e CNPJ só com números, telefone como +55DDDNÚMERO, e-mail e chave
 * aleatória em minúsculas. @returns {{ chave: string } | { erro: string }}
 */
export function normalizarChavePix(tipo, chave) {
  const texto = String(chave ?? '').trim();
  switch (tipo) {
    case 'cpf':
      return cpfValido(texto) ? { chave: soDigitos(texto) } : { erro: 'CPF inválido: confira os 11 números.' };
    case 'cnpj':
      return cnpjValido(texto) ? { chave: soDigitos(texto) } : { erro: 'CNPJ inválido: confira os 14 números.' };
    case 'telefone': {
      let d = soDigitos(texto);
      if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
      if ((d.length !== 10 && d.length !== 11) || d.startsWith('0')) {
        return { erro: 'Informe o celular com DDD, por exemplo: (47) 99999-0001.' };
      }
      return { chave: `+55${d}` };
    }
    case 'email': {
      const email = texto.toLowerCase();
      return EMAIL.test(email) && email.length <= 77 ? { chave: email } : { erro: 'Informe um e-mail válido.' };
    }
    case 'aleatoria': {
      const aleatoria = texto.toLowerCase();
      return ALEATORIA.test(aleatoria)
        ? { chave: aleatoria }
        : { erro: 'A chave aleatória tem 36 caracteres, no formato 123e4567-e89b-12d3-a456-426614174000.' };
    }
    default:
      return { erro: 'Escolha o tipo da chave Pix.' };
  }
}

/** Nome e cidade no BR Code: sem acentos, só letras, números e espaços, com o tamanho máximo do padrão. */
export function textoPix(texto, maximo) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo)
    .trim();
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos — o fim do BR Code. */
export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Campo EMV: identificador, tamanho com 2 dígitos e o valor. */
const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

const CAMPO_MAXIMO = 99; // um campo EMV guarda até 99 caracteres
const DESCRICAO_MINIMA = 8; // menos que isso não ajuda ninguém a reconhecer o pagamento

/**
 * "Pix copia e cola" estático: chave, nome e cidade do recebedor e, se informados, o valor e uma descrição
 * (o app do banco mostra a quem paga, ex.: "Mensalidade 10 2026 Ana"). A descrição divide o campo da conta
 * com a chave: com uma chave longa, ela é encurtada ou fica de fora.
 * O identificador da transação fica "***" (Pix estático sem identificação, aceito por todos os bancos).
 */
export function gerarPixCopiaECola({ chave, recebedor, cidade, valor, descricao }) {
  let conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const espaco = CAMPO_MAXIMO - conta.length - 4; // 4 = identificador e tamanho do campo da descrição
  const texto = textoPix(descricao, Math.max(0, espaco));
  if (texto.length >= DESCRICAO_MINIMA) conta += campo('02', texto);
  let payload = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986');
  if (Number(valor) > 0) payload += campo('54', Number(valor).toFixed(2));
  payload +=
    campo('58', 'BR') +
    campo('59', textoPix(recebedor, RECEBEDOR_MAXIMO)) +
    campo('60', textoPix(cidade, CIDADE_MAXIMA)) +
    campo('62', campo('05', '***'));
  payload += '6304';
  return payload + crc16(payload);
}
