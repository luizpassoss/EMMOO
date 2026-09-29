import { assertValid } from '../../shared/validation.js';
import { validarPlano } from './plano.validator.js';

/** Casos de uso de planos de mensalidade (RF03). */
export function createPlanoService({ planos }) {
  return {
    listar() {
      return planos.list();
    },
    async criar(input) {
      const { erros, dados } = validarPlano(input);
      assertValid(erros);
      return planos.create(dados);
    },
  };
}
