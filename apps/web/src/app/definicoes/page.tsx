'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppSheet } from '@/components/app-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { StudioHeader } from '@/components/studio-nav';
import { useTheme } from '@/components/theme-provider';
import { Botao, Rotulo } from '@/components/ui';
import { LoadError } from '@/components/viewer-ui';
import { endSession, useSession } from '@/lib/session';
import { useResource } from '@/lib/viewer-data';
import type { CreatorProfile } from '@/lib/creator-api';

const AREAS = [
  ['conta', 'Conta e perfil', 'user'], ['aparencia', 'Aparência', 'sparkle'],
  ['privacidade', 'Privacidade', 'lock'], ['notificacoes', 'Notificações', 'bell'],
  ['dm', 'DM e interacções', 'chat'], ['disponibilidade', 'Disponibilidade', 'calendar'],
  ['conteudo', 'Conteúdo', 'camera'], ['eventos', 'Eventos', 'calendar'],
  ['pagamentos', 'Pagamentos', 'wallet'], ['pro', 'NaDM Pro', 'sparkle'],
  ['seguranca', 'Segurança', 'shield'], ['ajuda', 'Ajuda e suporte', 'book'],
] as const;

export default function SettingsPage() { return <Suspense fallback={<ACarregar />}><Settings /></Suspense>; }
function Settings() {
  const router = useRouter();
  const search = useSearchParams();
  const { profile, profileReady, profileError, refreshProfile, userId, mode, setMode } = useSession();
  const { preference, setTheme } = useTheme();
  const own = useResource<CreatorProfile>(profile ? '/profiles/me' : null, userId);
  const settings = own.data?.settings;
  const [notice, setNotice] = useState(false);
  const current = AREAS.find(([key]) => key === search.get('area'));
  if (!profileReady) return <Screen header={<StudioHeader titulo="Definições" />}><ACarregar /></Screen>;
  if (profileError) return <Screen header={<StudioHeader titulo="Definições" />}><LoadError message={profileError} retry={refreshProfile} /></Screen>;
  const notes: Record<string, string> = {
    conta: profile ? profile.displayName + ' · @' + profile.handle : 'Conta de demonstração',
    aparencia: preference === 'system' ? 'Tema do sistema · texto padrão' : preference === 'dark' ? 'Tema escuro · texto padrão' : 'Tema claro · texto padrão',
    privacidade: settings?.publicVisible === false ? 'Perfil escondido' : profile ? 'Perfil público · visibilidade e descoberta' : 'A tua conta e os teus dados',
    notificacoes: settings?.notifications === false ? 'Avisos desligados nas preferências' : 'Actividade dos teus pedidos',
    dm: settings?.whoCanMessage === 'customers' ? 'Preferência: quem já comprou' : settings?.whoCanMessage === 'members' ? 'Preferência: só membros' : 'Pedidos e conversas existentes',
    disponibilidade: profile ? profile.availabilityStatus === 'AVAILABLE' ? 'Disponível · a aceitar pedidos' : 'Novos pedidos indisponíveis' : 'Disponível para contas de criador',
    conteudo: 'Publicações e rascunhos', eventos: 'Preparar eventos · bilheteira indisponível',
    pagamentos: settings?.expressPhone ? 'Número Express guardado · por verificar' : 'Carteira e dados de recebimento',
    pro: 'Conhecer o plano · subscrição indisponível', seguranca: 'Este navegador · conta de demonstração', ajuda: 'Como usar a NaDM e obter ajuda',
  };
  const targets: Record<string, { href: string; label: string; creator?: boolean }> = {
    conta: { href: '/estudio/perfil?tab=appearance', label: 'Editar nome e perfil', creator: true },
    privacidade: { href: '/estudio/perfil?tab=public', label: 'Definir visibilidade', creator: true },
    notificacoes: { href: profile ? '/estudio/perfil?tab=privacy' : '/notificacoes', label: profile ? 'Preferências de avisos' : 'Ver avisos' },
    dm: { href: profile ? '/estudio/perfil?tab=privacy' : '/conversas', label: profile ? 'Preferências de mensagens' : 'Abrir conversas' },
    disponibilidade: { href: '/estudio/agenda', label: 'Gerir disponibilidade', creator: true },
    conteudo: { href: profile ? '/estudio/publicar' : '/meu', label: profile ? 'Preparar publicação' : 'Abrir biblioteca' },
    eventos: { href: '/estudio/eventos', label: 'Preparar evento', creator: true },
    pagamentos: { href: profile ? '/wallet' : '/meu?tab=pedidos', label: profile ? 'Abrir carteira' : 'Ver os meus pedidos' },
    pro: { href: '/estudio/pro', label: 'Conhecer o NaDM Pro', creator: true },
    seguranca: { href: '/seguranca', label: 'Gerir acesso neste aparelho' },
  };
  const target = current ? targets[current[0]] : null;
  return <Screen header={current ? <TituloComVolta voltarPara="/definicoes" titulo={current[1]} subtitulo="Centro de controlo" /> : <StudioHeader titulo="Definições" subtitulo="O teu centro de controlo" accao={<Link href={profile && mode === 'creator' ? '/' + profile.handle : '/meu'} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-[11.5px] font-[900]">{profile && mode === 'creator' ? 'Ver perfil' : 'A minha conta'}</Link>} />} contentClassName="!pt-2" footer={!current && <><Link href={profile && mode === 'creator' ? '/' + profile.handle : '/inicio'} className="flex min-h-14 items-center justify-center rounded-full bg-lime px-5 text-[14px] font-[1000] text-lime-ink">{profile && mode === 'creator' ? 'Ver o meu perfil' : 'Voltar ao início'}</Link><p className="mt-2 text-center text-[11px] font-bold text-dim">A usar como {mode === 'creator' ? 'Criador' : 'Espectador'} · muda o modo no cartão da conta</p></>}>
    {!current ? <>
      <section className="rounded-[28px] border border-line bg-surface p-[15px]">
        <div className="flex items-center gap-[13px]"><span className="flex size-[52px] shrink-0 items-center justify-center rounded-full border border-line bg-surface2 text-[20px] font-[1000] text-lime-text">{profile?.displayName.slice(0, 1) ?? <Icon name="user" />}</span><div className="min-w-0"><h2 className="text-[16px] font-[1000]">{profile?.displayName ?? 'A tua conta'}</h2><p className="mt-0.5 text-[11.5px] font-bold text-dim">{profile ? 'nadm.ao/' + profile.handle : 'Demonstração NaDM'}</p></div></div>
        <div className="mt-[15px] mb-[7px]"><Rotulo>A usar a NaDM como</Rotulo></div>
        <div className="space-y-1.5">{([
          ['buyer', 'Espectador', 'Sigo, compro e mando DM', 'user'],
          ['creator', 'Criador', 'Recebo pedidos e publico', 'tag'],
          ['brand', 'Empresa', 'Contrato criadores para campanhas', 'briefcase'],
        ] as const).map(([key, title, description, icon]) => <button key={key} aria-pressed={mode === key} onClick={() => { if (key === 'brand') setNotice(true); else if (key === 'creator' && !profile) router.push('/criar-perfil?role=creator'); else { setMode(key); router.push(key === 'creator' ? '/estudio' : '/inicio'); } }} className={`flex w-full items-center gap-2.5 rounded-[18px] px-3 py-2.5 text-left ${mode === key ? 'bg-lime text-lime-ink' : 'border border-line'}`}><span className={`flex size-[34px] shrink-0 items-center justify-center rounded-xl ${mode === key ? 'bg-lime-ink/10' : 'bg-surface2 text-dim'}`}><Icon name={icon} className="size-[15px]" /></span><span className="flex-1"><span className="block text-[13px] font-[900]">{title}</span><span className={`block text-[10.5px] font-bold ${mode === key ? 'opacity-75' : 'text-dim'}`}>{description}</span></span><span className={`size-[17px] rounded-full border-2 ${mode === key ? 'border-lime-ink bg-lime-ink' : 'border-line'}`} /></button>)}</div>
      </section>
      <div className="mt-5 mb-2"><Rotulo>Centro de controlo</Rotulo></div>
      <div className="space-y-1.5">{AREAS.map(([key, title, icon]) => <Link key={key} href={'/definicoes?area=' + key} className="toque flex items-center gap-[11px] rounded-[20px] border border-line bg-surface px-[13px] py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface2 text-lime-text"><Icon name={icon as IconName} className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-[13.5px] font-[900]">{title}</span><span className="mt-0.5 block truncate text-[11px] font-bold text-dim">{notes[key]}</span></span><Icon name="arrow" className="size-[15px] text-dim" /></Link>)}</div>
    </> : current[0] === 'aparencia' ? <><div className="mb-2"><Rotulo>Tema</Rotulo></div><div className="space-y-2">{(['system', 'light', 'dark'] as const).map(value => <button key={value} aria-pressed={preference === value} onClick={() => setTheme(value)} className={`flex w-full items-center justify-between rounded-[22px] border p-4 text-[14px] font-[900] ${preference === value ? 'border-lime-text bg-surface2' : 'border-line bg-surface'}`}><span>{value === 'system' ? 'Sistema' : value === 'light' ? 'Claro' : 'Escuro'}</span><span className={`size-5 rounded-full border-2 ${preference === value ? 'border-lime-text bg-lime' : 'border-line'}`} /></button>)}</div><p className="mt-3 text-[12px] font-bold leading-relaxed text-dim">A escolha fica neste dispositivo. No modo Sistema, a NaDM acompanha o tema do teu aparelho.</p></> : current[0] === 'ajuda' ? <section className="space-y-3">{[['Onde estão os meus pedidos?', 'Em Meu, abre Pedidos. Cada pedido reúne a conversa, o pagamento e a entrega.'], ['Como recebo dinheiro?', 'Os trabalhos aprovados aparecem na carteira. Levantamentos reais ainda não estão disponíveis nesta demonstração.'], ['Preciso de outra conta para criar?', 'Não. Escolhe Criador no centro de controlo e cria o teu perfil, se ainda não tiveres um.'], ['Falar com suporte', 'O atendimento e a apresentação de denúncias ainda não estão ligados. Não envies documentos de identidade por esta demonstração.']].map(([title, body]) => <details key={title} className="rounded-[22px] border border-line bg-surface p-4"><summary className="cursor-pointer text-[13.5px] font-[900]">{title}</summary><p className="mt-3 text-[12.5px] font-bold leading-relaxed text-dim">{body}</p></details>)}</section> : <section className="rounded-[26px] border border-line bg-surface p-4"><span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-surface2 text-lime-text"><Icon name={current[2]} /></span><h2 className="text-[18px] font-[1000]">{current[1]}</h2><p className="mt-2 text-[13px] font-bold leading-relaxed text-dim">{notes[current[0]]}</p>{target && <Link href={target.creator && !profile ? '/criar-perfil?role=creator' : target.href} className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-lime px-4 text-[13px] font-[1000] text-lime-ink">{target.creator && !profile ? 'Criar perfil de criador' : target.label}</Link>}{current[0] === 'conta' && <button onClick={endSession} className="mt-3 min-h-11 w-full text-[13px] font-[900] text-danger">Sair da conta</button>}</section>}
    {notice && <AppSheet title="Espaço de empresa" onClose={() => setNotice(false)}><p className="text-[13px] font-bold leading-relaxed text-dim">O espaço de empresa ainda não está disponível. A tua conta actual mantém-se.</p><Botao bloco className="mt-5" onClick={() => setNotice(false)}>Entendi</Botao></AppSheet>}
  </Screen>;
}
