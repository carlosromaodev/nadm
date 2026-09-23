'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flor } from './flor';
import { Screen, TituloComVolta } from './screen';
import { ACarregar } from './states';
import { Botao, Painel, Rotulo } from './ui';
import { LinkAction, LoadError } from './viewer-ui';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useLocalSelection, useResource, type ContentItem } from '@/lib/viewer-data';

export function ContentView({ handle, id, playlist = false }: { handle: string; id: string; playlist?: boolean }) {
  const { userId } = useSession();
  const router = useRouter();
  const content = useResource<ContentItem>(`/profiles/${encodeURIComponent(handle)}/content/${encodeURIComponent(id)}`, userId);
  const saved = useLocalSelection('saved-content');
  const [selected, setSelected] = useState(0);
  const [failedMedia, setFailedMedia] = useState<string | null>(null);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [aDesbloquear, setADesbloquear] = useState(false);
  const [erroCompra, setErroCompra] = useState<string | null>(null);
  const item = content.data;
  const key = `${handle}/${id}`;

  if (content.error) return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo={playlist ? 'Playlist' : 'Publicação'} />}><LoadError title={content.status === 404 ? 'Conteúdo não encontrado' : undefined} message={content.status === 404 ? 'Este conteúdo pode ter sido removido, não estar publicado ou não estar disponível para a tua conta.' : content.error} retry={content.status === 404 ? undefined : content.retry} /><LinkAction href={`/${handle}`} secondary className="w-full">Voltar ao perfil</LinkAction></Screen>;
  if (!item) return <ACarregar />;
  const media = item.media[selected] ?? item.media[0];
  const locked = item.access !== 'GRANTED';
  const name = item.title || (playlist ? 'Playlist' : item.kind === 'VIDEO' ? 'Vídeo' : item.kind === 'ALBUM' ? 'Álbum' : 'Publicação');
  const podeDesbloquear = locked && Boolean(item.unlockOfferId);

  /**
   * Desbloquear é contratar.
   *
   * Cria o pedido e segue para o pagamento, como qualquer outra compra na NaDM
   * — o acesso é concedido pela captura, não por este ecrã (DP-15, UC-09).
   */
  async function desbloquear() {
    if (!userId) {
      router.push(`/entrar?next=${encodeURIComponent(`/${handle}/p/${id}`)}`);
      return;
    }

    setADesbloquear(true);
    setErroCompra(null);

    try {
      const deal = await api<{ id: string }>('/deals', {
        method: 'POST',
        actorUserId: userId,
        body: { offerId: item!.unlockOfferId },
      });

      router.push(`/deals/${deal.id}/pagar`);
    } catch (cause) {
      setErroCompra(cause instanceof ApiError ? cause.message : 'Não foi possível desbloquear.');
      setADesbloquear(false);
    }
  }

  return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo={name} subtitulo={`@${handle} · ${new Date(item.publishedAt).toLocaleDateString('pt-AO')}`} />} footer={locked ? <><Botao disabled={!podeDesbloquear || aDesbloquear} bloco onClick={() => void desbloquear()}>{item.visibility === 'MEMBERS' ? 'Exclusivo para membros' : aDesbloquear ? 'A abrir…' : item.price ? `Desbloquear · ${formatMoney(item.price)}` : 'Conteúdo fechado'}</Botao>{erroCompra && <p role="alert" className="mt-2 text-center text-[12px] font-[800] text-danger">{erroCompra}</p>}<p className="mt-2 text-center text-[12px] font-[700] text-dim">{podeDesbloquear ? 'Pagas uma vez e o acesso fica teu. O valor só sai depois de confirmares.' : item.visibility === 'MEMBERS' ? 'A adesão mensal ainda não está disponível. Não é feita nenhuma cobrança.' : 'Este conteúdo não está à venda.'}</p>{item.visibility === 'MEMBERS' && <Link href={`/${handle}/membro`} className="mt-2 block py-2 text-center text-[13px] font-[900] text-lime-text">Ver adesão mensal</Link>}</> : <div className="flex gap-2"><Botao variante="secundario" className="h-12 flex-1 text-[13px]" aria-pressed={saved.values.includes(key)} onClick={() => saved.toggle(key)}>{saved.values.includes(key) ? 'Guardado' : 'Guardar ligação'}</Botao><LinkAction href={`/${handle}/dm`} className="flex-1">Pedir algo assim</LinkAction></div>}>
    <div className="mb-3 flex items-center justify-between"><Rotulo>{playlist ? 'Playlist' : item.kind === 'ALBUM' ? 'Álbum' : item.kind === 'VIDEO' ? 'Vídeo' : 'Fotografia'}</Rotulo><span className="rounded-full border border-line px-3 py-1 text-[12px] font-[900] text-dim">{locked ? 'Fechado' : item.visibility === 'PUBLIC' ? 'Livre' : 'Acesso confirmado'}</span></div>
    <div className={`relative overflow-hidden rounded-[26px] border border-line bg-surface2 ${playlist || item.kind === 'VIDEO' ? 'aspect-video' : 'min-h-[300px]'}`}>
      {media && !locked ? failedMedia === media.id ? <div className="flex min-h-[230px] flex-col items-center justify-center gap-3 px-4 text-center"><Flor className="size-12 opacity-40" /><p className="text-[13px] font-[800]">Não foi possível abrir o ficheiro.</p><Botao variante="secundario" className="h-11 text-[13px]" onClick={() => { setFailedMedia(null); setMediaAttempt((value) => value + 1); content.retry(); }}>Tentar novamente</Botao></div> : media.mimeType.startsWith('video/') ? <video key={`${media.id}:${mediaAttempt}`} src={media.url} controls playsInline preload="metadata" onError={() => setFailedMedia(media.id)} className="h-full max-h-[65dvh] w-full bg-black" aria-label={media.title ?? name} /> : media.mimeType.startsWith('audio/') ? <div className="flex min-h-[230px] flex-col items-center justify-center gap-5 p-4"><Flor className="size-16" /><audio src={media.url} controls preload="metadata" onError={() => setFailedMedia(media.id)} className="w-full" aria-label={media.title ?? name} /></div> : <img key={`${media.id}:${mediaAttempt}`} src={media.url} alt={media.title || item.caption || name} onError={() => setFailedMedia(media.id)} className="max-h-[65dvh] w-full object-contain" /> : <div className="relative flex min-h-[280px] flex-col items-center justify-center gap-3 px-5 text-center">{item.coverUrl && <img src={item.coverUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />}<Flor className="relative size-[100px] opacity-30" /><h2 className="relative text-[19px] font-[1000]">{locked ? item.visibility === 'MEMBERS' ? 'Só para membros' : 'Há mais aqui dentro' : 'Sem ficheiros disponíveis'}</h2>{locked && item.price && <p className="algarismos relative text-[24px] font-[1000] text-lime-text">{formatMoney(item.price)}</p>}</div>}
    </div>
    <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed font-[700]">{item.caption}</p>
    {!locked && item.media.length > 1 && <section className="mt-5"><Rotulo>{playlist ? 'Nesta playlist' : 'Neste álbum'}</Rotulo><div className="mt-2 space-y-2">{item.media.map((entry, index) => <button key={entry.id} onClick={() => { setSelected(index); setFailedMedia(null); }} aria-pressed={selected === index} className={`flex min-h-14 w-full items-center gap-3 rounded-[20px] border px-4 text-left ${selected === index ? 'border-lime bg-wash' : 'border-line bg-surface'}`}><span className="algarismos text-[14px] font-[1000] text-lime-text">{index + 1}</span><span className="flex-1 text-[13px] font-[900]">{entry.title ?? `${playlist ? 'Vídeo' : 'Ficheiro'} ${index + 1}`}</span><span className="text-[12px] font-[800] text-dim">{selected === index ? 'A ver' : 'Abrir'}</span></button>)}</div></section>}
    <Painel className="mt-5"><p className="text-[12px] leading-relaxed font-[700] text-dim">{locked ? 'O acesso depende de confirmação no servidor. Uma ligação guardada não desbloqueia conteúdo pago.' : 'Guardar adiciona esta ligação aos favoritos neste dispositivo. Não faz download nem garante acesso sem rede.'}</p></Painel>
    {saved.storageError && <p role="alert" className="mt-2 text-[12px] text-danger">Não foi possível guardar a ligação neste navegador.</p>}
  </Screen>;
}
