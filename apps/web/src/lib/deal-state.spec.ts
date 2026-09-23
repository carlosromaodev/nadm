import { describe, expect, it } from 'vitest';
import { estadoVisual, passosDoPedido, podePedirDevolucao, proximoPasso } from './deal-state';

describe('pedidos encerrados', () => {
  it.each(['DECLINED', 'EXPIRED', 'REFUNDED'] as const)('não transforma %s numa aceitação', status => {
    const steps = passosDoPedido(status, 'REFUNDED');
    expect(steps.find(step => step.chave === 'aceitacao')?.estado).not.toBe('feito');
    expect(steps.some(step => step.estado === 'agora')).toBe(false);
    expect(steps[0].detalhe).toBe('O valor foi devolvido.');
  });
});

describe('estadoVisual', () => {
  it('distingue um pedido por pagar de um pedido pago à espera do criador', () => {
    expect(estadoVisual('PROPOSED', 'PENDING').etiqueta).toBe('Por pagar');
    expect(estadoVisual('PROPOSED', 'HELD').etiqueta).toBe('À espera');
  });

  it('diz que o dinheiro ainda não foi pago enquanto o escrow está pendente', () => {
    expect(estadoVisual('PROPOSED', 'PENDING').retido).toBe('ainda por pagar');
  });

  it('diz que está retido depois da captura, mesmo antes de o criador aceitar', () => {
    expect(estadoVisual('PROPOSED', 'HELD').retido).toBe('retido na NaDM');
    expect(estadoVisual('ACCEPTED', 'HELD').retido).toBe('retido na NaDM');
  });

  it('na entrega, diz explicitamente que fica retido até o comprador aprovar', () => {
    expect(estadoVisual('DELIVERED', 'HELD').retido).toBe('retido até aprovares');
  });

  it('depois de libertado, diz que foi para o criador', () => {
    expect(estadoVisual('PAID', 'RELEASED').retido).toBe('libertado ao criador');
  });

  it('numa devolução, diz que voltou para o comprador', () => {
    expect(estadoVisual('REFUNDED', 'REFUNDED').retido).toBe('devolvido a ti');
  });

  it('o estado do dinheiro manda sobre o estado comercial', () => {
    expect(estadoVisual('DELIVERED', 'RELEASED').retido).toBe('libertado ao criador');
  });

  it('o progresso cresce ao longo do percurso e fecha em 100', () => {
    const percurso = [
      estadoVisual('PROPOSED', 'PENDING').progresso,
      estadoVisual('PROPOSED', 'HELD').progresso,
      estadoVisual('ACCEPTED', 'HELD').progresso,
      estadoVisual('DELIVERED', 'HELD').progresso,
      estadoVisual('PAID', 'RELEASED').progresso,
    ];

    expect(percurso).toEqual([...percurso].sort((a, b) => a - b));
    expect(percurso.at(-1)).toBe(100);
  });

  it('marca como espera o que depende de outra pessoa, e como mau o que correu mal', () => {
    expect(estadoVisual('PROPOSED', 'HELD').tom).toBe('espera');
    expect(estadoVisual('ACCEPTED', 'HELD').tom).toBe('ok');
    expect(estadoVisual('EXPIRED', 'FAILED').tom).toBe('mau');
    expect(estadoVisual('REFUNDED', 'REFUNDED').tom).toBe('mau');
  });
});

describe('passosDoPedido', () => {
  it('são sempre os mesmos quatro, pela mesma ordem', () => {
    expect(passosDoPedido('PROPOSED', 'PENDING').map((p) => p.chave)).toEqual([
      'pagamento',
      'aceitacao',
      'entrega',
      'aprovacao',
    ]);
  });

  it('num pedido por pagar, o passo actual é o pagamento', () => {
    const passos = passosDoPedido('PROPOSED', 'PENDING');

    expect(passos.map((p) => p.estado)).toEqual(['agora', 'futuro', 'futuro', 'futuro']);
  });

  it('pago e por aceitar, o pagamento fica feito e a aceitação é o passo actual', () => {
    const passos = passosDoPedido('PROPOSED', 'HELD');

    expect(passos.map((p) => p.estado)).toEqual(['feito', 'agora', 'futuro', 'futuro']);
  });

  it('entregue, só falta a aprovação', () => {
    const passos = passosDoPedido('DELIVERED', 'HELD');

    expect(passos.map((p) => p.estado)).toEqual(['feito', 'feito', 'feito', 'agora']);
  });

  it('concluído, os quatro estão feitos', () => {
    const passos = passosDoPedido('PAID', 'RELEASED');

    expect(passos.every((p) => p.estado === 'feito')).toBe(true);
  });

  it('há no máximo um passo actual de cada vez', () => {
    const casos = [
      ['PROPOSED', 'PENDING'],
      ['PROPOSED', 'HELD'],
      ['ACCEPTED', 'HELD'],
      ['DELIVERED', 'HELD'],
      ['PAID', 'RELEASED'],
    ] as const;

    for (const [status, escrow] of casos) {
      const agora = passosDoPedido(status, escrow).filter((p) => p.estado === 'agora');
      expect(agora.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('proximoPasso', () => {
  it('o comprador paga antes de o criador aceitar', () => {
    expect(proximoPasso('PROPOSED', 'PENDING', 'buyer').primario).toBe('Pagar');
    expect(proximoPasso('PROPOSED', 'PENDING', 'creator').primario).toBeUndefined();
  });

  it('o criador só decide depois de o pedido estar pago', () => {
    expect(proximoPasso('PROPOSED', 'PENDING', 'creator').primario).toBeUndefined();
    expect(proximoPasso('PROPOSED', 'HELD', 'creator').primario).toBe('Aceitar');
  });

  it('um comprador que já pagou não tem acção — espera pelo criador', () => {
    const passo = proximoPasso('PROPOSED', 'HELD', 'buyer');

    expect(passo.primario).toBeUndefined();
    expect(passo.nota).toContain('volta para ti');
  });

  it('só o criador entrega', () => {
    expect(proximoPasso('ACCEPTED', 'HELD', 'creator').primario).toBe('Entregar');
    expect(proximoPasso('ACCEPTED', 'HELD', 'buyer').primario).toBeUndefined();
  });

  it('só o comprador aprova', () => {
    expect(proximoPasso('DELIVERED', 'HELD', 'buyer').primario).toBe('Aprovar');
    expect(proximoPasso('DELIVERED', 'HELD', 'creator').primario).toBeUndefined();
  });

  it('num pedido concluído ninguém tem acção primária', () => {
    expect(proximoPasso('PAID', 'RELEASED', 'buyer').primario).toBeUndefined();
    expect(proximoPasso('PAID', 'RELEASED', 'creator').primario).toBeUndefined();
  });
});

describe('podePedirDevolucao', () => {
  const agora = new Date('2026-09-22T12:00:00.000Z');
  const antes = new Date('2026-09-22T11:59:59.000Z');

  it('nasce exactamente no instante que o servidor indica', () => {
    const deal = { refundableFrom: agora.toISOString() };

    expect(podePedirDevolucao(deal, 'buyer', antes)).toBe(false);
    expect(podePedirDevolucao(deal, 'buyer', agora)).toBe(true);
  });

  it('é do comprador, nunca do criador', () => {
    const deal = { refundableFrom: agora.toISOString() };

    expect(podePedirDevolucao(deal, 'creator', agora)).toBe(false);
  });

  it('sem prazo por cumprir não há devolução a pedir', () => {
    expect(podePedirDevolucao({ refundableFrom: null }, 'buyer', agora)).toBe(false);
    expect(podePedirDevolucao({}, 'buyer', agora)).toBe(false);
  });
});
