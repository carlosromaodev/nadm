'use client';
import { ACarregar } from './states';
import { Screen, TituloComVolta } from './screen';
import { Botao, LinkBotao } from './ui';
export function DealUnavailable({ error, retry }: { error: string; retry: () => void }) {
  if (!error) return <ACarregar />;
  return <Screen header={<TituloComVolta voltarPara="/" titulo="Não conseguimos abrir o pedido" />}><p role="alert" className="my-5 text-sm text-danger">{error}</p><Botao bloco onClick={retry}>Tentar novamente</Botao><LinkBotao bloco variante="secundario" href="/" className="mt-3">Voltar ao início</LinkBotao></Screen>;
}
