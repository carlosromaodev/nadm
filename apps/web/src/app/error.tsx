'use client';
import { Botao, LinkBotao } from '@/components/ui';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="m-auto p-6 text-center"><h1 className="text-2xl font-black">Não conseguimos abrir esta página</h1><p className="my-4 text-dim">Tenta outra vez. Os dados já guardados continuam na tua conta.</p><Botao onClick={reset} bloco>Tentar novamente</Botao><LinkBotao href="/" variante="secundario" bloco className="mt-3">Voltar ao início</LinkBotao></main>;
}
