'use client';

import { useParams } from 'next/navigation';
import { Flor } from '@/components/flor';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Painel, Rotulo } from '@/components/ui';
import { Avatar, LinkAction, LoadError } from '@/components/viewer-ui';
import { formatMoney } from '@/lib/money';
import { useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function MembershipPage() {
  const { handle } = useParams<{ handle: string }>();
  const resource = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  const profile = resource.data;
  if (resource.error) return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Ser membro" />}><LoadError message={resource.error} retry={resource.retry} /></Screen>;
  if (!profile) return <ACarregar />;
  const tier = profile.offers.find((offer) => offer.kind === 'MEMBERSHIP');
  return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Ser membro" subtitulo="Apoia o criador. Acompanha de perto." />} footer={<LinkAction href={`/${handle}`} secondary className="w-full">Voltar ao perfil</LinkAction>}>
    <div className="relative overflow-hidden rounded-[30px] bg-lime p-5 text-lime-ink"><Flor className="absolute -top-6 -right-6 size-[132px] opacity-20" fill="var(--color-lime-ink)" /><div className="relative flex items-center gap-3"><Avatar name={profile.displayName} /><div><p className="text-[14px] font-[900]">{profile.displayName}</p><p className="text-[12px] font-[700]">@{profile.handle}</p></div></div><p className="algarismos relative mt-5 text-[32px] leading-tight font-[1000] tracking-[-0.04em]">{tier ? formatMoney(tier.price) : 'Mais perto.'}</p><p className="relative mt-1 text-[12px] font-[800]">{tier ? 'por mês · adesão ao criador' : 'Adesão mensal ao criador'}</p></div>
    <section className="mt-5"><Rotulo>{tier ? tier.title : 'A adesão mensal'}</Rotulo><Painel className="mt-2"><p className="text-[13px] leading-relaxed font-[700]">{tier?.description || 'A adesão dá acesso ao conteúdo exclusivo durante o período confirmado. É diferente de um pedido com prazo e entrega.'}</p></Painel></section>
    <Painel className="mt-3"><h2 className="text-[14px] font-[900] text-amber">{tier ? 'Adesões ainda indisponíveis' : 'Este criador ainda não abriu adesões'}</h2><p className="mt-2 text-[12px] leading-relaxed font-[700] text-dim">{tier ? 'A cobrança e a confirmação de acesso de membros ainda estão em preparação. Não ativamos adesões nem cobramos por este ecrã.' : 'Podes seguir o perfil e ver as ofertas disponíveis enquanto aguardas.'}</p></Painel>
    <p className="mt-4 text-[12px] leading-relaxed font-[700] text-dim">Esta adesão é ao criador, não ao plano NaDM Pro. A renovação automática só estará disponível com um meio de pagamento compatível e o teu consentimento.</p>
  </Screen>;
}
