import { Flor } from '@/components/flor';
import { LinkBotao } from '@/components/ui';
export default function NotFound() {
  return <main className="m-auto p-6 text-center"><Flor className="mx-auto size-16 opacity-40" /><h1 className="mt-5 text-2xl font-black">Esta página não está aqui</h1><p className="my-4 text-dim">O link pode ter mudado ou já não estar disponível.</p><LinkBotao href="/descobrir">Descobrir criadores</LinkBotao></main>;
}
