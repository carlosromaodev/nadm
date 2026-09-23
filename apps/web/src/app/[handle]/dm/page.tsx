'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Screen, TituloComVolta } from '@/components/screen';
import { Icon } from '@/components/icon';
import { ACarregar } from '@/components/states';
import { Vazio } from '@/components/ui';
import { LinkAction, LoadError } from '@/components/viewer-ui';
import { formatMoney } from '@/lib/money';
import { profileOfferHref, useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function DmPage() {
  const { handle } = useParams<{ handle: string }>();
  const { data: profile, error, retry } = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  if (error) return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Abrir DM" />}><LoadError message={error} retry={retry} /></Screen>;
  if (!profile) return <ACarregar />;
  const offers = profile.offers.filter((offer) => ['CUSTOM_SERVICE', 'DIRECT_MESSAGE', 'BOOKING'].includes(offer.kind));
  const available = profile.availabilityStatus === 'AVAILABLE';
  return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo={profile.displayName} subtitulo="Escolhe o que queres pedir" />} footer={<LinkAction href="/conversas" secondary className="w-full">Abrir as minhas conversas</LinkAction>}>
    <div className="flex flex-col gap-2.5"><div className="max-w-[280px] self-start rounded-[22px_22px_22px_8px] border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-[1.45] font-[700]">{available ? 'Olá! Escolhe abaixo o que precisas. Cada pedido tem a sua conversa, o prazo e o pagamento no mesmo lugar.' : 'Os novos pedidos estão em pausa. Se já tens um pedido, podes continuar a conversa normalmente.'}</div>
      {offers.map((offer) => {
        const inner = <><span className="flex min-w-0 items-center gap-2.5"><span className={`size-[7px] shrink-0 rounded-full ${available ? 'bg-lime' : 'bg-amber'}`} /><span><span className="block text-[13.5px] font-[900]">{offer.title}</span><span className="block text-[12px] font-[700] text-dim">{offer.kind === 'BOOKING' ? 'Escolhe um horário' : `Prazo: ${offer.slaHours} h`}</span></span></span><span className="algarismos shrink-0 text-[15px] font-[1000]">{formatMoney(offer.price)}</span></>;
        return available ? <Link key={offer.id} href={profileOfferHref(handle, offer)} className="flex items-center justify-between gap-2.5 rounded-[20px] border border-line bg-surface p-[13px] hover:bg-surface2">{inner}</Link> : <div key={offer.id} className="flex items-center justify-between gap-2.5 rounded-[20px] border border-line bg-surface p-[13px] opacity-60">{inner}</div>;
      })}
      <Link href={'/' + handle + '/mimar'} className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-[13px]"><span className="flex size-9 items-center justify-center rounded-xl bg-surface2 text-lime-text"><Icon name="sparkle" className="size-[18px]" /></span><span className="flex-1"><span className="block text-[13.5px] font-[900]">Mimar · apoio livre</span><span className="block text-[12px] font-bold text-dim">Sem prazo nem entrega</span></span><Icon name="arrow" className="size-4 text-dim" /></Link>
      {!offers.length && <Vazio titulo="Sem ofertas disponíveis" texto="Volta ao perfil para conhecer o conteúdo e acompanhar este criador." accao={<LinkAction href={`/${handle}`} secondary>Ver perfil</LinkAction>} />}
      <p className="mt-2 text-[12px] leading-relaxed font-[700] text-dim">As conversas gratuitas ainda não estão disponíveis nesta versão. Podes trocar mensagens nos teus pedidos existentes.</p>
    </div>
  </Screen>;
}
