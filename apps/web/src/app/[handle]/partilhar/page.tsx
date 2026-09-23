'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Flor } from '@/components/flor';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, Painel, Rotulo } from '@/components/ui';
import { LinkAction, LoadError } from '@/components/viewer-ui';
import { useSession } from '@/lib/session';
import { createProfileQr, profileShareUrl } from '@/lib/profile-share';
import { useLocalSelection, useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function SharePage() {
  const { handle } = useParams<{ handle: string }>();
  const { profile: mine, userId } = useSession();
  const resource = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  const checklist = useLocalSelection(`share-checklist:${handle}`);
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const own = mine?.handle === handle;
  useEffect(() => { setUrl(profileShareUrl(window.location.origin, handle)); setQr(null); setMessage(null); }, [handle]);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado. Já podes colar onde quiseres.'); }
    catch { setMessage('Não foi possível copiar automaticamente. Seleciona e copia o endereço abaixo.'); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: resource.data?.displayName ?? 'NaDM', text: 'Conhece este perfil na NaDM', url }); setMessage('Partilha concluída.'); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('A partilha não foi concluída. Podes copiar o link.'); }
  }
  async function openQr() {
    setShowQr(true);
    if (qr) return;
    setQrLoading(true);
    try { setQr(await createProfileQr(url)); }
    catch { setMessage('Não foi possível gerar o código. Tenta novamente ou copia o link.'); }
    finally { setQrLoading(false); }
  }

  if (resource.error) return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Partilhar link" />}><LoadError message={resource.error} retry={resource.retry} /></Screen>;
  if (!resource.data) return <ACarregar />;
  return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo={own ? 'O teu link, a circular' : 'Partilhar este perfil'} subtitulo={resource.data.displayName} />} footer={<Botao bloco onClick={() => void share()} disabled={!url}>Partilhar o link</Botao>}>
    {showQr ? <Painel className="flex flex-col items-center rounded-[30px] px-5 py-6">{qrLoading ? <ACarregar /> : qr ? <><img src={qr} alt={`Código QR que abre ${url}`} width={240} height={240} className="size-[240px] max-w-full rounded-[20px] bg-white" /><p className="mt-4 break-all text-center text-[16px] font-[1000]">{url.replace(/^https?:\/\//, '')}</p><p className="mt-2 text-center text-[12px] leading-relaxed font-[700] text-dim">Aponta a câmara para abrir o perfil. Mantém a margem branca ao imprimir.</p><a href={qr} download={`nadm-${handle}-qr.png`} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[13px] font-[900]">Guardar QR para imprimir</a></> : <Botao onClick={() => void openQr()} variante="secundario">Tentar gerar o QR</Botao>}<button onClick={() => setShowQr(false)} className="mt-3 min-h-11 text-[13px] font-[900] text-dim">Voltar ao cartão do link</button></Painel> : <div className="relative overflow-hidden rounded-[30px] bg-lime p-5 text-lime-ink"><Flor className="absolute -right-6 -bottom-8 size-[150px] opacity-20" fill="var(--color-lime-ink)" /><div className="relative"><p className="text-[10px] font-[800] uppercase tracking-[0.14em] opacity-70">{own ? 'O teu endereço' : 'Partilha com quem vai gostar'}</p><p className="mt-2 break-all text-[25px] leading-tight font-[1000] tracking-[-0.04em]">{url.replace(/^https?:\/\//, '') || `/${handle}`}</p><div className="mt-5 flex gap-2"><button onClick={() => void copy()} disabled={!url} className="min-h-[50px] flex-1 rounded-full bg-lime-ink px-4 text-[14px] font-[1000] text-[#e1f83b]">Copiar link</button><button onClick={() => void openQr()} disabled={!url} aria-label="Mostrar código QR" className="size-[50px] shrink-0 rounded-full border border-lime-ink/30 text-[13px] font-[1000]">QR</button></div></div></div>}
    {message && <p role="status" className="mt-3 text-[12px] leading-relaxed font-[700] text-dim">{message}</p>}
    <label className="mt-4 block"><span className="sr-only">Endereço do perfil para copiar</span><input readOnly value={url} onFocus={(event) => event.target.select()} className="min-h-11 w-full rounded-[16px] border border-line bg-surface px-3 text-[12px] font-[700]" /></label>
    <section className="mt-5"><Rotulo>{own ? 'Onde pôr o teu link' : 'Onde partilhar'}</Rotulo><div className="mt-2 space-y-2"><a href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[68px] items-center justify-between gap-3 rounded-[20px] border border-line bg-surface px-4"><span><span className="block text-[13px] font-[900]">WhatsApp</span><span className="mt-1 block text-[12px] font-[700] text-dim">Abre uma mensagem com este link.</span></span><span className="text-[12px] font-[900] text-lime-text">Abrir ↗</span></a>{['Instagram', 'TikTok'].map((channel) => <div key={channel} className="rounded-[20px] border border-line bg-surface p-4"><div className="flex items-center justify-between gap-2"><span className="text-[13px] font-[900]">{channel}</span><button onClick={() => void copy()} className="min-h-10 rounded-full border border-line px-3 text-[12px] font-[900]">Copiar link</button></div><p className="text-[12px] font-[700] text-dim">Cola o endereço na bio ou numa mensagem.</p>{own && <label className="mt-3 flex min-h-11 items-center gap-3 border-t border-line pt-2 text-[12px] font-[800]"><input type="checkbox" checked={checklist.values.includes(channel)} onChange={() => checklist.toggle(channel)} className="size-5 accent-lime" />Já coloquei na minha bio</label>}</div>)}</div></section>
    {own ? <p className="mt-3 text-[12px] leading-relaxed font-[700] text-dim">A lista é uma marcação tua neste dispositivo; não verificamos as redes sociais. As métricas de visitas só aparecerão quando houver medição real.</p> : <LinkAction href={userId ? '/criar-perfil' : '/entrar?next=%2Fcriar-perfil'} secondary className="mt-5 w-full">Criar o meu NaDM</LinkAction>}
    {checklist.storageError && <p role="alert" className="mt-3 text-[12px] text-danger">Não foi possível guardar a lista neste navegador.</p>}
    {url.startsWith('http://localhost') && <p className="mt-3 text-[12px] font-[700] text-amber">Este endereço só abre nesta máquina. Abre esta página pelo túnel ngrok para partilhar com outro telemóvel.</p>}
    <Link href={`/${handle}`} className="mt-4 block py-2 text-center text-[12px] font-[900] text-lime-text">Ver perfil</Link>
  </Screen>;
}
