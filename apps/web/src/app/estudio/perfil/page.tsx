'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreatorBoundary, CreatorField, CreatorNotice, CreatorSwitch, creatorField, creatorLink } from '@/components/creator-ui';
import { Flor } from '@/components/flor';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { LinhaDeSeccao, StudioHeader } from '@/components/studio-nav';
import { useTheme } from '@/components/theme-provider';
import { Botao, Rotulo } from '@/components/ui';
import { api } from '@/lib/api';
import { useCreatorData, type CreatorSettings } from '@/lib/creator-api';
import { endSession } from '@/lib/session';

const TABS = [['appearance', 'Aparência'], ['privacy', 'Quem me fala'], ['public', 'O que é público'], ['account', 'Conta']] as const;
const TAB_NAMES = { content: 'Conteúdo', offers: 'Contratar', reputation: 'Reputação' };
export default function EditarPerfilPage() { return <Suspense fallback={<ACarregar />}><EditarPerfil /></Suspense>; }
function EditarPerfil() {
  const state = useCreatorData();
  const { setTheme } = useTheme();
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<string>('appearance');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [settings, setSettings] = useState<CreatorSettings>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => { if (state.data) { setName(state.data.profile.displayName); setBio(state.data.profile.bio ?? ''); setSettings(state.data.profile.settings ?? {}); } }, [state.data]);
  useEffect(() => { const requested = search.get('tab'); setTab(TABS.some(([key]) => key === requested) ? requested! : 'appearance'); }, [search]);
  function changeTab(key: string) { setTab(key); router.replace('/estudio/perfil?tab=' + key, { scroll: false }); }
  const order = settings.tabOrder ?? ['content', 'offers', 'reputation'];
  function move(index: number, delta: number) { const copy = [...order]; [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]]; setSettings({ ...settings, tabOrder: copy }); }
  async function save() {
    if (!state.userId || saving) return;
    setSaving(true); setFeedback(null);
    try { await api('/profiles/me', { method: 'PATCH', actorUserId: state.userId, body: { displayName: name.trim(), bio: bio.trim() || null, settings } }); if (settings.theme) setTheme(settings.theme); setFeedback({ message: 'Perfil e definições guardados.' }); state.reload(); }
    catch (cause) { setFeedback({ message: cause instanceof Error ? cause.message : 'Não foi possível guardar.', error: true }); }
    finally { setSaving(false); }
  }
  return <Screen header={<><StudioHeader titulo="O meu perfil" subtitulo="A tua presença na NaDM" accao={state.data && <Link href={`/${state.data.profile.handle}`} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-[11.5px] font-[900]">Ver perfil</Link>} /><div className="rolo -mx-4 mt-[11px] flex gap-1.5 px-4 pb-0.5" aria-label="Definições do perfil">{TABS.map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => changeTab(key)} className={`h-[34px] shrink-0 rounded-full px-[13px] text-[12px] font-[900] ${tab === key ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{label}</button>)}</div></>} footer={state.data && <Botao bloco disabled={saving || name.trim().length < 2 || bio.length > 500} onClick={() => void save()}>{saving ? 'A guardar…' : 'Guardar alterações'}</Botao>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      {tab === 'appearance' && <><div className="mt-2 flex items-center gap-3.5 rounded-[26px] border border-line bg-surface p-3.5"><span className="flex size-[66px] shrink-0 items-center justify-center rounded-full bg-surface2 text-[25px] font-black">{name.slice(0, 1).toUpperCase()}</span><div><p className="text-[15px] font-[900]">{name || 'O teu nome'}</p><p className="mt-1 text-[12px] font-[700] text-dim">A tua apresentação pública</p></div></div>
        <CreatorField label="Nome"><input className={creatorField} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></CreatorField>{state.data && <p className="mt-2 rounded-[18px] border border-line bg-wash px-3.5 py-[13px] text-[14px] font-extrabold"><span className="text-dim">nadm.ao/</span>{state.data.profile.handle}</p>}<CreatorField label="Bio" note={`${bio.length} / 500 caracteres`}><textarea className={creatorField} rows={3} maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} /></CreatorField>
        <div className="grid grid-cols-2 gap-3"><CreatorField label="Categoria"><input className={creatorField} maxLength={80} value={settings.category ?? ''} onChange={(event) => setSettings({ ...settings, category: event.target.value })} placeholder="Ex.: Música" /></CreatorField><CreatorField label="Localização"><input className={creatorField} maxLength={100} value={settings.location ?? ''} onChange={(event) => setSettings({ ...settings, location: event.target.value })} placeholder="Ex.: Luanda" /></CreatorField></div>
        <CreatorField label="Tema do perfil"><select className={creatorField} value={settings.theme ?? 'dark'} onChange={(event) => setSettings({ ...settings, theme: event.target.value as 'dark' | 'light' })}><option value="dark">Verde escuro</option><option value="light">Claro</option></select></CreatorField>
        <div className="mt-5 mb-2"><Rotulo>Ordem dos separadores</Rotulo></div><ul className="flex flex-col gap-2">{order.map((key, index) => <li key={key} className="flex items-center gap-2 rounded-[18px] border border-line bg-surface px-[13px] py-2"><span className="algarismos text-[12px] font-[900] text-dim">{index + 1}</span><span className="flex-1 text-[13px] font-[900]">{TAB_NAMES[key]}</span><button type="button" aria-label={`Subir ${TAB_NAMES[key]}`} disabled={index === 0} onClick={() => move(index, -1)} className="size-11 rounded-full border border-line disabled:opacity-30">↑</button><button type="button" aria-label={`Descer ${TAB_NAMES[key]}`} disabled={index === order.length - 1} onClick={() => move(index, 1)} className="size-11 rounded-full border border-line disabled:opacity-30">↓</button></li>)}</ul>
        {state.data && <Link href={`/${state.data.profile.handle}`} className={`${creatorLink} mt-4 w-full`}>Ver perfil publicado</Link>}
      </>}
      {tab === 'privacy' && <><CreatorField label="Preferência de mensagens" note="Define quem preferes receber na tua caixa."><select className={creatorField} value={settings.whoCanMessage ?? 'everyone'} onChange={(event) => setSettings({ ...settings, whoCanMessage: event.target.value as CreatorSettings['whoCanMessage'] })}><option value="everyone">Toda a gente</option><option value="customers">Quem já comprou</option><option value="members">Só membros</option></select></CreatorField><div className="mt-4 rounded-[24px] border border-line bg-surface p-4"><CreatorSwitch label="Avisos de actividade" note="Guardar a tua preferência de notificações da app." checked={settings.notifications ?? true} onChange={(notifications) => setSettings({ ...settings, notifications })} /></div><CreatorNotice>A preferência de mensagens não substitui o bloqueio de contas. Pedidos pagos e conversas existentes mantêm o acesso das duas partes.</CreatorNotice><LinhaDeSeccao href="/seguranca" titulo="Segurança e acesso" nota="Sessões e proteção da tua conta" icone={<Flor className="size-5" />} /></>}
      {tab === 'public' && <div className="mt-2 rounded-[24px] border border-line bg-surface p-4"><Rotulo>Visibilidade do perfil</Rotulo><CreatorSwitch label="Perfil visível" note="Desligar esconde o perfil público sem apagar os teus pedidos." checked={settings.publicVisible ?? true} onChange={(publicVisible) => setSettings({ ...settings, publicVisible })} /><CreatorSwitch label="Aparecer na descoberta" note="Permite encontrar o teu perfil na pesquisa." checked={settings.discoverable ?? true} onChange={(discoverable) => setSettings({ ...settings, discoverable })} /><div className="my-3 border-t border-line" /><Rotulo>O que partilhas</Rotulo><CreatorSwitch label="Mostrar actividade" note="Resultados quando existirem dados suficientes." checked={settings.showActivity ?? true} onChange={(showActivity) => setSettings({ ...settings, showActivity })} /><CreatorSwitch label="Mostrar avaliações" checked={settings.showReviews ?? true} onChange={(showReviews) => setSettings({ ...settings, showReviews })} /><p className="mt-3 text-[11.5px] font-[700] text-dim">Os nomes dos compradores e os movimentos da tua carteira continuam privados.</p></div>}
      {tab === 'account' && <><CreatorField label="Número Express" note="Guardar o número não o verifica nem inicia um levantamento."><input className={creatorField} type="tel" placeholder="+244923000000" value={settings.expressPhone ?? ''} onChange={(event) => setSettings({ ...settings, expressPhone: event.target.value.replace(/\s/g, '') || null })} /></CreatorField><div className="mt-5 flex flex-col gap-2"><LinhaDeSeccao href="/wallet" titulo="Carteira" nota="Saldos e movimentos reais" icone={<span>↗</span>} /><LinhaDeSeccao href="/estudio/pro" titulo="NaDM Pro" nota="Plano da plataforma para criadores" icone={<Flor className="size-5" />} /><LinhaDeSeccao href="/estudio/agenda" titulo="Entrar em pausa" nota="Fecha novos pedidos sem apagar o perfil" icone={<span>Ⅱ</span>} /><LinhaDeSeccao href="/seguranca" titulo="Centro de segurança" nota="Gerir o acesso à conta" icone={<span>↗</span>} /></div><button type="button" onClick={endSession} className="mt-5 min-h-11 w-full rounded-full border border-danger text-[13px] font-[900] text-danger">Sair da conta</button></>}
      {feedback && <CreatorNotice error={feedback.error}>{feedback.message}</CreatorNotice>}
    </CreatorBoundary>
  </Screen>;
}
