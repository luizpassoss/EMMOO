import { gerarPixCopiaECola } from '../../domain/pix.js';
import { NotFoundError } from '../../shared/errors.js';
import { assertValid } from '../../shared/validation.js';
import { validarDadosDaEscola } from './dadosEscola.validator.js';

/**
 * Dados da própria escola (coordenação): o nome e o Pix que o responsável usa para pagar a mensalidade.
 * Com o Pix configurado, devolve um exemplo (QR e "copia e cola" sem valor) para conferir no app do banco
 * antes de as famílias usarem.
 */
export function createDadosEscolaService({ escolas, escolaId, qrCode }) {
  async function apresentar(escola) {
    const configurado = Boolean(escola.pixChave);
    let exemplo = null;
    if (configurado) {
      const copiaECola = gerarPixCopiaECola({ chave: escola.pixChave, recebedor: escola.pixRecebedor, cidade: escola.pixCidade });
      exemplo = { copiaECola, qrCodeSvg: await qrCode(copiaECola) };
    }
    return {
      id: escola.id,
      nome: escola.nome,
      codigo: escola.codigo,
      pix: {
        configurado,
        tipo: escola.pixTipo ?? null,
        chave: escola.pixChave ?? null,
        recebedor: escola.pixRecebedor ?? null,
        cidade: escola.pixCidade ?? null,
        exemplo,
      },
    };
  }

  async function buscar() {
    const escola = await escolas.findById(escolaId);
    if (!escola) throw new NotFoundError('Escola não encontrada.');
    return escola;
  }

  return {
    async ver() {
      return apresentar(await buscar());
    },
    async atualizar(input = {}) {
      await buscar();
      const { erros, dados } = validarDadosDaEscola(input);
      assertValid(erros);
      return apresentar(await escolas.update(escolaId, dados));
    },
  };
}
