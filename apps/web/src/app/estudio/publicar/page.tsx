'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CreatorBoundary, CreatorField, CreatorNotice, creatorField, creatorLink } from '@/components/creator-ui';
import { Flor, FlorAGirar } from '@/components/flor';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { creatorMoney, useCreatorData } from '@/lib/creator-api';
import { contentValidation, emptyContentDraft, uploadCreatorMedia, type ContentDraft, type CreatorContent, type CreatorMedia } from '@/lib/creator-content';
import { formatMoney } from '@/lib/money';

const KINDS = [['PHOTO', 'Foto', 'camera'], ['VIDEO', 'Vídeo', 'video'], ['ALBUM', 'Álbum', 'book'], ['PLAYLIST', 'Playlist', 'music']] as const;
type Upload = { file: File; progress: number; error?: string };
export default function PublicarPage() {
  const state = useCreatorData();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ContentDraft>(emptyContentDraft);
  const [media, setMedia] = useState<CreatorMedia[]>([]);
  const [items, setItems] = useState<CreatorContent[]>([]);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [saving, setSaving] = useState(false);
  const [contentAvailable, setContentAvailable] = useState(true);
  const [preview, setPreview] = useState(false);
  const [restored, setRestored] = useState(false);
  const [published, setPublished] = useState<CreatorContent | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [newFolder, setNewFolder] = useState(false);
  useEffect(() => {
    if (!state.userId) return;
    let active = true;
    setRestored(false);
    try { const stored = localStorage.getItem(`nadm.content-draft.${state.userId}`); if (stored) { const result = JSON.parse(stored) as { draft: ContentDraft; media: CreatorMedia[] }; if (result.draft?.kind && Array.isArray(result.media)) { setDraft(result.draft); setMedia(result.media); } } } catch { /* A new draft remains usable when local storage is unavailable. */ }
    setRestored(true);
    api<{ items: CreatorContent[] }>('/profiles/me/content', { actorUserId: state.userId }).then((result) => { if (active) setItems(result.items); }).catch((cause: unknown) => { if (active) { if (cause instanceof ApiError && cause.status === 404) { setContentAvailable(false); setFeedback({ message: 'A publicação ainda não está disponível. Podes preparar e guardar o rascunho neste dispositivo.' }); } else setFeedback({ message: 'Não foi possível carregar as publicações. Tenta novamente mais tarde.', error: true }); } });
    return () => { active = false; };
  }, [state.userId]);
  useEffect(() => {
    if (!restored || !state.userId) return;
    try { localStorage.setItem(`nadm.content-draft.${state.userId}`, JSON.stringify({ draft, media })); } catch { setFeedback({ message: 'Não foi possível guardar neste dispositivo. Usa Guardar rascunho para guardar no servidor.', error: true }); }
  }, [draft, media, restored, state.userId]);
  async function chooseFiles(files: File[]) {
    if (!state.userId || upload && !upload.error) return;
    setFeedback(null); setPublished(null);
    const selected = draft.kind === 'PHOTO' || draft.kind === 'VIDEO' ? files.slice(0, 1) : files;
    for (const file of selected) {
      setUpload({ file, progress: 0 });
      try {
        const result = await uploadCreatorMedia(file, state.userId, (progress) => setUpload({ file, progress }));
        setMedia((current) => draft.kind === 'PHOTO' || draft.kind === 'VIDEO' ? [result] : [...current, result]);
        setDraft((current) => ({ ...current, mediaIds: draft.kind === 'PHOTO' || draft.kind === 'VIDEO' ? [result.id] : [...current.mediaIds, result.id] }));
        setUpload(null);
      } catch (cause) { setUpload({ file, progress: 0, error: cause instanceof Error ? cause.message : 'Não foi possível carregar.' }); break; }
    }
    if (input.current) input.current.value = '';
  }
  function reorder(index: number, delta: number) { const next = [...media]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setMedia(next); setDraft({ ...draft, mediaIds: next.map((item) => item.id) }); }
  function load(item: CreatorContent) {
    setDraft({ id: item.id, kind: item.kind, caption: item.caption, visibility: item.visibility, priceMinor: item.price.amount, mediaIds: item.mediaIds, previewMediaIds: item.previewMediaIds ?? [], folder: item.folder ?? '', scheduledAt: item.scheduledAt ? new Date(new Date(item.scheduledAt).getTime() + 3600000).toISOString().slice(0, 16) : '' }); setMedia(item.media); setPublished(null); setFeedback(null);
  }
  async function save(status: CreatorContent['status']) {
    if (!state.userId || saving || upload && !upload.error) return;
    if (!contentAvailable) {
      if (status !== 'DRAFT') return;
      try { localStorage.setItem(`nadm.content-draft.${state.userId}`, JSON.stringify({ draft, media })); setFeedback({ message: 'Rascunho guardado neste dispositivo. Ainda não foi publicado.' }); }
      catch { setFeedback({ message: 'Não foi possível guardar o rascunho neste dispositivo.', error: true }); }
      return;
    }
    const error = contentValidation(draft, media, status !== 'DRAFT');
    if (error) { setFeedback({ message: error, error: true }); return; }
    const scheduledAt = draft.scheduledAt ? new Date(`${draft.scheduledAt}:00+01:00`).toISOString() : undefined;
    if (status === 'SCHEDULED' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { setFeedback({ message: 'Escolhe uma data futura para agendar.', error: true }); return; }
    setSaving(true); setFeedback(null);
    try {
      const result = await api<CreatorContent>('/profiles/me/content', { method: 'POST', actorUserId: state.userId, body: { ...draft, priceMinor: draft.visibility === 'PUBLIC' ? '0' : draft.priceMinor, status, scheduledAt: status === 'SCHEDULED' ? scheduledAt : undefined, previewMediaIds: draft.kind === 'PLAYLIST' ? draft.previewMediaIds : [] } });
      setDraft((current) => ({ ...current, id: result.id })); setItems((current) => [result, ...current.filter((item) => item.id !== result.id)]); setPublished(status === 'DRAFT' ? null : result); setFeedback({ message: status === 'DRAFT' ? 'Rascunho guardado no servidor. Só tu o podes ver.' : status === 'SCHEDULED' ? 'Publicação agendada. A data está guardada no servidor.' : 'Publicado. Já aparece no teu perfil.' });
    } catch (cause) { setFeedback({ message: cause instanceof Error ? cause.message : 'Não foi possível guardar a publicação.', error: true }); }
    finally { setSaving(false); }
  }
  const busy = saving || Boolean(upload && !upload.error);
  const folders = [...new Set(items.map((item) => item.folder).filter((folder): folder is string => Boolean(folder)).concat(draft.folder ? [draft.folder] : []))];
  return <Screen header={<StudioHeader titulo={preview ? 'Pré-visualizar' : published?.status === 'SCHEDULED' ? 'Publicação agendada' : published ? 'Publicado' : 'Publicar'} subtitulo={draft.id ? 'Rascunho e edição de conteúdo' : 'Conteúdo novo no teu perfil'} accao={<Pastilha tom={published?.status === 'PUBLISHED' ? 'ok' : 'espera'}>{published?.status === 'PUBLISHED' ? 'No perfil' : 'Rascunho'}</Pastilha>} />} footer={state.data && <><Botao bloco disabled={!contentAvailable || busy || !media.length || !draft.caption.trim() || draft.visibility === 'MEMBERS'} onClick={() => void save(draft.scheduledAt ? 'SCHEDULED' : 'PUBLISHED')}>{busy ? 'A guardar…' : draft.scheduledAt ? 'Guardar agendamento' : 'Publicar agora'}</Botao><div className="mt-1 flex gap-2"><button type="button" onClick={() => void save('DRAFT')} disabled={busy} className="min-h-11 flex-1 rounded-full text-[12px] font-[900] text-dim">Guardar rascunho</button><button type="button" onClick={() => setPreview(!preview)} className="min-h-11 flex-1 rounded-full text-[12px] font-[900] text-dim">{preview ? 'Voltar a editar' : 'Pré-visualizar'}</button></div></>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      {!preview && <><div className="mb-3 grid grid-cols-5 gap-1.5">{KINDS.map(([kind, label, icon]) => <button key={kind} type="button" disabled={busy} onClick={() => { setDraft({ ...draft, kind }); setPublished(null); }} aria-pressed={draft.kind === kind} className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-[900] ${draft.kind === kind ? 'bg-lime text-lime-ink' : 'border border-line bg-surface text-dim'}`}><Icon name={icon} className="size-[18px]" />{label}</button>)}<Link href="/estudio/eventos" className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[20px] border border-line bg-surface text-[11px] font-[900] text-dim"><Icon name="calendar" className="size-[18px]" />Evento</Link></div>{items.length > 0 && <label className="mb-4 block"><span className="sr-only">Abrir publicação existente</span><select className={creatorField} value={draft.id ?? ''} onChange={(event) => { const item = items.find((value) => value.id === event.target.value); if (item) load(item); else { setDraft(emptyContentDraft()); setMedia([]); setPublished(null); } }}><option value="">Nova publicação</option>{items.map((item) => <option key={item.id} value={item.id}>{item.status === 'DRAFT' ? 'Rascunho' : item.status === 'SCHEDULED' ? 'Agendada' : 'Publicada'} · {item.caption.slice(0, 40) || 'Sem legenda'}</option>)}</select></label>}</>}
      <input ref={input} type="file" aria-label="Escolher ficheiros" className="sr-only" accept={draft.kind === 'PHOTO' ? 'image/jpeg,image/png,image/webp' : draft.kind === 'VIDEO' || draft.kind === 'PLAYLIST' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,video/mp4,video/webm'} multiple={draft.kind === 'ALBUM' || draft.kind === 'PLAYLIST'} onChange={(event) => void chooseFiles(Array.from(event.target.files ?? []))} />
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[26px] border border-line bg-surface2">{upload ? <div className="px-5 text-center">{upload.error ? <><p className="text-[14px] font-[900] text-danger">O carregamento falhou</p><p className="mt-1 text-[12px] text-dim">{upload.error}</p><button type="button" onClick={() => void chooseFiles([upload.file])} className={`${creatorLink} mt-3`}>Tentar de novo</button></> : <><FlorAGirar className="mx-auto size-10" legenda="A carregar" /><p className="algarismos mt-2 text-[16px] font-[1000]">{upload.progress}%</p><p className="mt-1 text-[11px] text-dim">{upload.progress === 100 ? 'O servidor está a validar o ficheiro.' : 'Não feches a página até terminar.'}</p></>}</div> : media[0] ? <MediaView media={media[0]} /> : <button type="button" onClick={() => input.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 px-6"><span className="flex size-12 items-center justify-center rounded-full bg-lime text-lime-ink"><Icon name="plus" className="size-[22px]" /></span><span className="text-[13px] font-[900]">Escolher {draft.kind === 'PHOTO' ? 'foto' : draft.kind === 'VIDEO' ? 'vídeo' : 'ficheiros'}</span><span className="text-[11px] font-[700] text-dim">Até 10 MB por ficheiro</span></button>}</div>
      {preview ? <><p className="mt-4 whitespace-pre-wrap text-[14px] font-[700] leading-relaxed">{draft.caption || 'A tua legenda aparece aqui.'}</p><p className="mt-3 text-[12px] font-[900] text-lime-text">{draft.visibility === 'PUBLIC' ? 'Público · gratuito' : draft.visibility === 'PAID' ? `Preço de rascunho · ${formatMoney(creatorMoney(draft.priceMinor))}` : 'Rascunho · só para membros'}</p>{media.slice(1).map((item) => <div key={item.id} className="mt-3 overflow-hidden rounded-[22px]"><MediaView media={item} /></div>)}</> : <>
        {media.length > 0 && <><div className="mt-2 flex flex-col gap-2">{media.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-[18px] border border-line bg-surface p-2"><span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface2 text-[20px]">{item.mimeType.startsWith('video') ? '▷' : '▧'}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-[900]">{draft.kind === 'PLAYLIST' ? `Vídeo ${index + 1}` : index === 0 ? 'Capa' : `Item ${index + 1}`}</p>{draft.kind === 'PLAYLIST' && <label className="mt-1 flex items-center gap-1 text-[11px] font-[700] text-dim"><input type="checkbox" checked={draft.previewMediaIds.includes(item.id)} onChange={(event) => setDraft({ ...draft, previewMediaIds: event.target.checked ? [...draft.previewMediaIds, item.id] : draft.previewMediaIds.filter((id) => id !== item.id) })} />Prévia gratuita</label>}</div><button type="button" aria-label={`Subir item ${index + 1}`} disabled={index === 0} onClick={() => reorder(index, -1)} className="size-11 rounded-full border border-line disabled:opacity-30">↑</button><button type="button" aria-label={`Remover item ${index + 1}`} onClick={() => { setMedia(media.filter((value) => value.id !== item.id)); setDraft({ ...draft, mediaIds: draft.mediaIds.filter((id) => id !== item.id), previewMediaIds: draft.previewMediaIds.filter((id) => id !== item.id) }); }} className="size-11 rounded-full text-danger">×</button></div>)}</div><button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-2 min-h-11 w-full rounded-full border border-dashed border-line text-[12px] font-[900]">{draft.kind === 'PHOTO' || draft.kind === 'VIDEO' ? 'Trocar ficheiro' : '+ Adicionar ficheiros'}</button></>}
        <CreatorField label="Legenda" note={`${draft.caption.length} / 300 caracteres`}><textarea className={creatorField} rows={3} maxLength={300} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} placeholder="Diz o que é isto" /></CreatorField>
        <div className="mt-4 mb-2"><Rotulo>Pasta</Rotulo></div><div className="flex flex-wrap gap-2">{folders.map((folder) => <button key={folder} type="button" aria-pressed={draft.folder === folder} onClick={() => setDraft({ ...draft, folder: draft.folder === folder ? '' : folder })} className={`min-h-11 rounded-full px-3 text-[12px] font-[900] ${draft.folder === folder ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{folder}</button>)}<button type="button" onClick={() => setNewFolder(!newFolder)} className="min-h-11 rounded-full border border-line px-3 text-[12px] font-[900]">+ Nova pasta</button></div>{newFolder && <div className="mt-2 flex gap-2"><input aria-label="Nome da nova pasta" className={creatorField} maxLength={60} value={folderName} onChange={(event) => setFolderName(event.target.value)} /><button type="button" disabled={!folderName.trim()} onClick={() => { setDraft({ ...draft, folder: folderName.trim() }); setFolderName(''); setNewFolder(false); }} className={creatorLink}>Criar</button></div>}
        <div className="mt-4"><Rotulo>Quem pode ver</Rotulo><div className="mt-2 flex rounded-full border border-line bg-wash p-1">{([['PUBLIC', 'Pública'], ['PAID', 'Paga'], ['MEMBERS', 'Membros']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={draft.visibility === value} onClick={() => setDraft({ ...draft, visibility: value })} className={`h-[38px] flex-1 rounded-full text-[12.5px] font-[900] ${draft.visibility === value ? 'bg-lime text-lime-ink' : 'text-dim'}`}>{label}</button>)}</div></div>
        {draft.visibility === 'PAID' && <CreatorNotice>Quem comprar paga uma vez e fica com o acesso. Recebes o preço menos 5%.</CreatorNotice>}
        {draft.visibility === 'MEMBERS' && <CreatorNotice>Os acessos de membros ainda não estão ligados. Este conteúdo pode ser preparado e guardado em privado, mas não posto à venda.</CreatorNotice>}
        {draft.visibility === 'PAID' && <CreatorField label="Preço"><select className={creatorField} value={draft.priceMinor} onChange={(event) => setDraft({ ...draft, priceMinor: event.target.value })}>{['350000', '750000', '1800000', '4500000'].map((price) => <option key={price} value={price}>{formatMoney(creatorMoney(price))}</option>)}</select><Link href="/estudio/pro" className="mt-2 inline-flex min-h-11 items-center text-[12px] font-[900] text-lime-text">Preço livre com NaDM Pro →</Link></CreatorField>}
        {draft.visibility === 'PUBLIC' && <CreatorField label="Agendar publicação" note="Hora de Angola (WAT, UTC+1). Deixa vazio para publicar agora."><input className={creatorField} type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft({ ...draft, scheduledAt: event.target.value })} /></CreatorField>}
      </>}
      {feedback && <CreatorNotice error={feedback.error}>{feedback.message}</CreatorNotice>}
      {published?.status === 'PUBLISHED' && state.data && <Link href={`/${state.data.profile.handle}/${published.kind === 'PLAYLIST' ? 'playlist' : 'p'}/${published.id}`} className={`${creatorLink} mt-3 w-full`}>Ver no perfil →</Link>}
    </CreatorBoundary>
  </Screen>;
}
function MediaView({ media }: { media: CreatorMedia }) {
  return media.mimeType.startsWith('video/') ? <video controls playsInline preload="metadata" src={media.url} className="max-h-[420px] w-full" /> : <img src={media.url} alt="Conteúdo seleccionado pelo criador" className="max-h-[420px] w-full object-contain" />;
}
