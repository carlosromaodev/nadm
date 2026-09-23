import type { DealStatus, EscrowStatus } from './api';

export type Tom = 'ok' | 'espera' | 'mau';

export interface EstadoVisual {
  /** O que aparece na pastilha carimbada. */
  etiqueta: string;
  tom: Tom;
  /** O que se diz ao lado do valor: onde está o dinheiro, em palavras. */
  retido: string;
  /** Quanto do percurso já foi feito, 0–100. */
  progresso: number;
}

/**
 * Mapeia o estado do `Deal` para o que o design mostra.
 *
 * O texto de `retido` vem do design e é deliberado: ao lado do valor diz-se
 * sempre onde o dinheiro está, e não só em que ponto está o trabalho. É a
 * pergunta que as duas partes têm de facto.
 *
 * Como o pagamento vem antes da aceitação, `PROPOSED` tem duas caras — por
 * pagar e pago à espera do criador — e é o estado do escrow que as separa.
 */
export function estadoVisual(status: DealStatus, escrow: EscrowStatus): EstadoVisual {
  const retido = ondeEstaODinheiro(status, escrow);

  switch (status) {
    case 'PROPOSED':
      return escrow === 'HELD'
        ? { etiqueta: 'À espera', tom: 'espera', retido, progresso: 18 }
        : { etiqueta: 'Por pagar', tom: 'espera', retido, progresso: 6 };
    case 'COUNTER_OFFERED':
      return { etiqueta: 'Contraproposta', tom: 'espera', retido, progresso: 24 };
    case 'ACCEPTED':
      return { etiqueta: 'Aceite', tom: 'ok', retido, progresso: 45 };
    case 'IN_PROGRESS':
      return { etiqueta: 'Em execução', tom: 'ok', retido, progresso: 64 };
    case 'DELIVERED':
      return { etiqueta: 'Entregue', tom: 'ok', retido, progresso: 86 };
    case 'APPROVED':
      return { etiqueta: 'Aprovado', tom: 'ok', retido, progresso: 96 };
    case 'PAID':
      return { etiqueta: 'Concluído', tom: 'ok', retido, progresso: 100 };
    case 'DECLINED':
      return { etiqueta: 'Recusado', tom: 'mau', retido, progresso: 100 };
    case 'REFUNDED':
      return { etiqueta: 'Devolvido', tom: 'mau', retido, progresso: 100 };
    case 'EXPIRED':
      return { etiqueta: 'Expirado', tom: 'mau', retido, progresso: 100 };
  }
}

function ondeEstaODinheiro(status: DealStatus, escrow: EscrowStatus): string {
  if (escrow === 'RELEASED') return 'libertado ao criador';
  if (escrow === 'REFUNDED') return 'devolvido a ti';
  if (escrow === 'FAILED') return 'pagamento não concluído';
  if (escrow === 'HELD') {
    return status === 'DELIVERED' ? 'retido até aprovares' : 'retido na NaDM';
  }

  return 'ainda por pagar';
}

/**
 * Os quatro passos que o design mostra no ecrã do pedido (P8), sempre os
 * mesmos e sempre pela mesma ordem.
 */
export type Passo = 'pagamento' | 'aceitacao' | 'entrega' | 'aprovacao';

export interface PassoVisual {
  chave: Passo;
  titulo: string;
  detalhe: string;
  estado: 'feito' | 'agora' | 'futuro';
}

export function passosDoPedido(status: DealStatus, escrow: EscrowStatus): PassoVisual[] {
  const encerrado = ['DECLINED', 'REFUNDED', 'EXPIRED'].includes(status);
  const pago = escrow !== 'PENDING' && escrow !== 'FAILED';
  const aceite = ['ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'APPROVED', 'PAID'].includes(status);
  const entregue = ['DELIVERED', 'APPROVED', 'PAID'].includes(status);
  const aprovado = ['APPROVED', 'PAID'].includes(status);

  const passo = (
    chave: Passo,
    titulo: string,
    feito: boolean,
    agora: boolean,
    detalhe: string,
  ): PassoVisual => ({
    chave,
    titulo,
    detalhe,
    estado: feito ? 'feito' : agora && !encerrado ? 'agora' : 'futuro',
  });

  return [
    passo(
      'pagamento',
      'Pagamento',
      pago,
      !pago,
      escrow === 'REFUNDED' ? 'O valor foi devolvido.' : pago ? 'Pagamento confirmado.' : encerrado ? 'Sem pagamento confirmado.' : 'O valor fica retido assim que pagares.',
    ),
    passo(
      'aceitacao',
      'Aceitação',
      aceite,
      pago && !aceite,
      encerrado ? 'O pedido foi encerrado.' : aceite ? 'O criador aceitou e o prazo começou.' : 'O criador tem de aceitar o pedido.',
    ),
    passo(
      'entrega',
      'Entrega',
      entregue,
      aceite && !entregue,
      entregue ? 'O trabalho foi entregue.' : 'O criador entrega dentro do prazo.',
    ),
    passo(
      'aprovacao',
      'Aprovação',
      aprovado,
      entregue && !aprovado,
      aprovado ? 'Aprovado e o valor libertado.' : 'Aprovas e o valor passa para o criador.',
    ),
  ];
}

/** O que fazer a seguir, do ponto de vista de quem está a olhar. */
export function proximoPasso(
  status: DealStatus,
  escrow: EscrowStatus,
  papel: 'buyer' | 'creator',
): { primario?: string; nota?: string } {
  const pago = escrow === 'HELD';

  if (papel === 'creator') {
    if (status === 'PROPOSED') {
      return pago
        ? { primario: 'Aceitar', nota: 'O valor já está retido. Se aceitares, podes trabalhar.' }
        : { nota: 'À espera de que o comprador pague. Só decides depois disso.' };
    }

    switch (status) {
      case 'ACCEPTED':
        return { primario: 'Entregar', nota: 'O valor está retido na NaDM até o comprador aprovar.' };
      case 'DELIVERED':
        return { nota: 'Entregue. À espera da aprovação do comprador.' };
      case 'PAID':
        return { nota: 'Concluído. O valor foi para a tua carteira.' };
      default:
        return {};
    }
  }

  if (status === 'PROPOSED') {
    return pago
      ? { nota: 'Pago. À espera de que o criador aceite. Se não aceitar, o valor volta para ti.' }
      : { primario: 'Pagar', nota: 'O valor fica retido na NaDM e só sai depois de aprovares.' };
  }

  switch (status) {
    case 'ACCEPTED':
      return { nota: 'O criador aceitou e está a trabalhar. O valor continua retido.' };
    case 'DELIVERED':
      return { primario: 'Aprovar', nota: 'Se aprovares, o valor passa para o criador.' };
    case 'PAID':
      return { nota: 'Concluído.' };
    default:
      return {};
  }
}

/**
 * T16 — o comprador pode levantar o dinheiro de um pedido entregue fora de
 * prazo.
 *
 * Quem decide quando o direito nasce é o servidor, em `refundableFrom`: aqui só
 * se compara com o relógio. Duplicar a regra do prazo no cliente seria ter duas
 * respostas para a mesma pergunta, e uma delas havia de ficar desactualizada.
 */
export function podePedirDevolucao(
  deal: { refundableFrom?: string | null },
  viewerRole: 'buyer' | 'creator',
  agora: Date,
): boolean {
  if (viewerRole !== 'buyer' || !deal.refundableFrom) return false;

  return agora.getTime() >= new Date(deal.refundableFrom).getTime();
}
