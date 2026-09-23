import type { Message } from '@/lib/api';
import { Flor } from './flor';

/**
 * A conversa. Mensagens das duas partes e transições do sistema na mesma
 * coluna, por ordem cronológica — lida de cima a baixo, conta a história
 * inteira do negócio (RN-049).
 */
export function Conversation({
  messages,
  viewerUserId,
  children,
}: {
  messages: Message[];
  viewerUserId: string | null;
  /** O cartão do pedido, inserido a seguir à primeira mensagem. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[9px]">
      {!messages.length ? <><DiaDivisor>Hoje</DiaDivisor>{children}</> : null}

      {messages.map((message, indice) => (
        <div key={message.id} className="contents">
          {indice === 0 || message.createdAt.slice(0, 10) !== messages[indice - 1].createdAt.slice(0, 10) ? <DiaDivisor>{rotuloDoDia(message.createdAt)}</DiaDivisor> : null}
          <Bolha message={message} viewerUserId={viewerUserId} />
          {indice === 0 && children ? children : null}
        </div>
      ))}
    </div>
  );
}

function Bolha({ message, viewerUserId }: { message: Message; viewerUserId: string | null }) {
  if (message.kind === 'STATE_CHANGE' || message.kind === 'SYSTEM') {
    return <Carimbo>{message.body}</Carimbo>;
  }

  const minha = message.senderUserId !== null && message.senderUserId === viewerUserId;

  return (
    <div
      className={'whitespace-pre-wrap break-words [overflow-wrap:anywhere] ' + (
        minha
          ? 'max-w-[255px] self-end rounded-[22px_22px_8px_22px] bg-lime px-[14px] py-[11px] text-[13.5px] font-[700] leading-[1.45] text-lime-ink'
          : 'max-w-[255px] self-start rounded-[22px_22px_22px_8px] border border-line bg-surface px-[14px] py-[11px] text-[13.5px] font-[700] leading-[1.45]'
      )}
    >
      {message.body}
    </div>
  );
}

/**
 * A transição escrita pelo sistema. Não é uma bolha de ninguém: é o carimbo que
 * fica no meio da conversa a dizer o que mudou.
 */
function Carimbo({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-1 flex items-center gap-2.5 self-stretch px-1">
      <Flor className="size-[11px] shrink-0 opacity-70" />
      <span className="text-[11px] font-[800] leading-[1.4] text-dim">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function DiaDivisor({ children }: { children: React.ReactNode }) {
  return (
    <div className="self-center text-[10px] font-[800] uppercase tracking-[0.12em] text-dim">
      {children}
    </div>
  );
}

function rotuloDoDia(iso: string | undefined): string {
  if (!iso) return 'Hoje';

  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia =
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate();

  if (mesmoDia) return 'Hoje';

  return data.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}
