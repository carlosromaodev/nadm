import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '@/lib/api';
import { Conversation } from './conversation';

function mensagem(overrides: Partial<Message> & Pick<Message, 'id' | 'kind' | 'body'>): Message {
  return {
    senderUserId: null,
    clientId: null,
    createdAt: '2026-09-17T09:00:00.000Z',
    ...overrides,
  };
}

const CONVERSA: Message[] = [
  mensagem({ id: '1', kind: 'TEXT', body: 'Queria um vídeo para a minha irmã.', senderUserId: 'ana' }),
  mensagem({ id: '2', kind: 'STATE_CHANGE', body: 'Pedido enviado ao criador.' }),
  mensagem({ id: '3', kind: 'TEXT', body: 'Aceitei, gravo amanhã.', senderUserId: 'nelson' }),
];

describe('Conversation', () => {
  it('mostra mensagens de pessoas e transições do sistema na mesma coluna', () => {
    render(<Conversation messages={CONVERSA} viewerUserId="ana" />);

    expect(screen.getByText('Queria um vídeo para a minha irmã.')).toBeInTheDocument();
    expect(screen.getByText('Pedido enviado ao criador.')).toBeInTheDocument();
    expect(screen.getByText('Aceitei, gravo amanhã.')).toBeInTheDocument();
  });

  it('mantém a ordem em que as mensagens chegaram', () => {
    render(<Conversation messages={CONVERSA} viewerUserId="ana" />);

    const textos = screen
      .getAllByText(/Queria um vídeo|Pedido enviado|Aceitei/)
      .map((elemento) => elemento.textContent);

    expect(textos).toEqual([
      'Queria um vídeo para a minha irmã.',
      'Pedido enviado ao criador.',
      'Aceitei, gravo amanhã.',
    ]);
  });

  it('a minha mensagem alinha à direita e a da outra parte à esquerda', () => {
    render(<Conversation messages={CONVERSA} viewerUserId="ana" />);

    expect(screen.getByText('Queria um vídeo para a minha irmã.').className).toContain('self-end');
    expect(screen.getByText('Aceitei, gravo amanhã.').className).toContain('self-start');
  });

  it('o mesmo lado troca quando é o criador a olhar', () => {
    render(<Conversation messages={CONVERSA} viewerUserId="nelson" />);

    expect(screen.getByText('Queria um vídeo para a minha irmã.').className).toContain(
      'self-start',
    );
    expect(screen.getByText('Aceitei, gravo amanhã.').className).toContain('self-end');
  });

  it('uma transição do sistema não é bolha de ninguém', () => {
    render(<Conversation messages={CONVERSA} viewerUserId="ana" />);

    const carimbo = screen.getByText('Pedido enviado ao criador.');

    expect(carimbo.className).not.toContain('self-end');
    expect(carimbo.className).not.toContain('bg-lime');
  });

  it('insere o cartão do pedido dentro da conversa, não fora dela', () => {
    render(
      <Conversation messages={CONVERSA} viewerUserId="ana">
        <div data-testid="cartao-do-pedido">Pedido NDM-2026-0000001</div>
      </Conversation>,
    );

    expect(screen.getByTestId('cartao-do-pedido')).toBeInTheDocument();
  });

  it('aguenta uma conversa vazia sem rebentar', () => {
    render(<Conversation messages={[]} viewerUserId="ana" />);

    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('não perde o cartão do pedido se ainda não houver mensagens', () => {
    render(<Conversation messages={[]} viewerUserId="ana"><div>Pedido novo</div></Conversation>);
    expect(screen.getByText('Pedido novo')).toBeInTheDocument();
  });
});
