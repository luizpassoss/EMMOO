/**
 * Valor em reais por extenso, como num recibo: 140 → "cento e quarenta reais",
 * 2005.5 → "dois mil e cinco reais e cinquenta centavos". Vai até 999.999.999,99.
 */
const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 1 a 999 por extenso ("cento e quarenta e cinco"). */
function ateMil(numero) {
  if (numero === 100) return 'cem';
  const partes = [];
  const centena = Math.floor(numero / 100);
  const resto = numero % 100;
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto >= 20) {
    partes.push(DEZENAS[Math.floor(resto / 10)] + (resto % 10 > 0 ? ` e ${UNIDADES[resto % 10]}` : ''));
  } else if (resto >= 10) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(' e ');
}

/** Número inteiro por extenso (0 a 999.999.999), com "e" entre os grupos quando a língua pede. */
function inteiroPorExtenso(numero) {
  if (numero === 0) return 'zero';
  const grupos = [
    { valor: Math.floor(numero / 1_000_000), nome: (n) => (n === 1 ? 'um milhão' : `${ateMil(n)} milhões`) },
    { valor: Math.floor((numero % 1_000_000) / 1000), nome: (n) => (n === 1 ? 'mil' : `${ateMil(n)} mil`) },
    { valor: numero % 1000, nome: ateMil },
  ].filter((grupo) => grupo.valor > 0);
  return grupos
    .map((grupo, indice) => {
      // O último grupo leva "e" quando é menor que 100 ou uma centena redonda: "mil e cem", "dois mil e cinco",
      // "um milhão e quinhentos mil"; mas "mil cento e cinquenta" (centena "quebrada" dispensa o "e").
      const ultimo = indice === grupos.length - 1 && indice > 0;
      const comE = ultimo && (grupo.valor < 100 || grupo.valor % 100 === 0);
      return `${comE ? 'e ' : ''}${grupo.nome(grupo.valor)}`;
    })
    .join(' ');
}

export function valorPorExtenso(valor) {
  const totalCentavos = Math.round(Number(valor) * 100);
  if (!Number.isFinite(totalCentavos) || totalCentavos < 0 || totalCentavos >= 100_000_000_000) {
    throw new RangeError('Valor fora do intervalo do extenso (0 a 999.999.999,99).');
  }
  const reais = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;
  const partes = [];
  if (reais > 0) {
    // "um milhão de reais", "dois milhões de reais" (milhão redondo pede "de").
    const de = reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${inteiroPorExtenso(reais)}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length > 0 ? partes.join(' e ') : 'zero reais';
}
