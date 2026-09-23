/**
 * Percentagem única e configurável enquanto DP-07 não fechar. Vive atrás de uma
 * porta para que passar a escalões não obrigue a mexer em nenhum caso de uso.
 */
export abstract class PricingPolicy {
  /** Comissão da plataforma em pontos base. 1500 = 15%. */
  abstract platformFeeBasisPoints(): number;

  /** Prazo de resposta do criador a uma proposta. Ver SDD §5.1. */
  abstract proposalWindowHours(): number;

  /** Janela do comprador para aprovar uma entrega, findo o qual T10 aprova por ele. */
  abstract approvalWindowHours(): number;

  /** Tolerância sobre `dueAt` antes de o comprador poder pedir devolução (T16). */
  abstract lateDeliveryGraceHours(): number;

  /**
   * Valor mínimo de levantamento, em cêntimos (RN-054).
   *
   * Existe porque cada ordem ao parceiro tem custo fixo: levantar 100 Kz
   * custaria à plataforma mais do que o que move.
   */
  abstract minimumPayoutMinor(): bigint;
}
