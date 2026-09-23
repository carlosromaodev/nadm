export interface CreatorMedia { id: string; mimeType: string; url: string }
export interface CreatorContent {
  id: string; kind: 'PHOTO' | 'VIDEO' | 'ALBUM' | 'PLAYLIST'; caption: string;
  visibility: 'PUBLIC' | 'PAID' | 'MEMBERS'; price: { amount: string; currency: string };
  status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED'; scheduledAt?: string | null;
  media: CreatorMedia[]; mediaIds: string[]; previewMediaIds: string[]; folder?: string | null;
}
export type ContentDraft = { id?: string; kind: CreatorContent['kind']; caption: string; visibility: CreatorContent['visibility']; priceMinor: string; mediaIds: string[]; previewMediaIds: string[]; folder: string; scheduledAt: string };
export const emptyContentDraft = (): ContentDraft => ({ kind: 'PHOTO', caption: '', visibility: 'PUBLIC', priceMinor: '350000', mediaIds: [], previewMediaIds: [], folder: '', scheduledAt: '' });
export function contentValidation(draft: ContentDraft, media: CreatorMedia[], publishing: boolean): string | null {
  if (draft.caption.length > 300) return 'A legenda pode ter até 300 caracteres.';
  if (!publishing) return null;
  if (!draft.caption.trim()) return 'Escreve uma legenda antes de publicar.';
  if (!media.length) return 'Escolhe e carrega pelo menos um ficheiro.';
  // `MEMBERS` continua fechado: a recorrência de assinatura é DP-09, e sem ela
  // um direito de membro não sabe quando expira. Vender por unidade funciona.
  if (draft.visibility === 'MEMBERS') return 'A publicação para membros ainda não está disponível. Podes vender esta publicação à unidade.';
  if (draft.visibility === 'PAID' && (!draft.priceMinor || BigInt(draft.priceMinor) <= 0n)) return 'Uma publicação paga precisa de um preço.';
  if (draft.kind === 'PHOTO' && (media.length !== 1 || !media[0].mimeType.startsWith('image/'))) return 'Uma foto deve ter exactamente uma imagem.';
  if (draft.kind === 'VIDEO' && (media.length !== 1 || !media[0].mimeType.startsWith('video/'))) return 'Um vídeo deve ter exactamente um ficheiro de vídeo.';
  if (draft.kind === 'PLAYLIST' && media.some((item) => !item.mimeType.startsWith('video/'))) return 'A playlist só pode conter vídeos.';
  return null;
}
export function uploadCreatorMedia(file: File, userId: string, onProgress: (value: number) => void): Promise<CreatorMedia> {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) { reject(new Error('O limite é 10 MB por ficheiro.')); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type)) { reject(new Error('Usa JPEG, PNG, WebP, MP4 ou WebM.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    reader.onload = () => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/media');
      request.timeout = 120000;
      request.setRequestHeader('Content-Type', 'application/json');
      request.setRequestHeader('X-Dev-User', userId);
      request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.floor(event.loaded * 100 / event.total)); };
      request.onerror = () => reject(new Error('O envio perdeu a ligação. Podes tentar novamente.'));
      request.ontimeout = () => reject(new Error('O envio demorou demasiado. Verifica a rede e tenta novamente.'));
      request.onload = () => {
        try {
          const body = JSON.parse(request.responseText) as CreatorMedia & { message?: string };
          if (request.status < 200 || request.status >= 300) reject(new Error(body.message ?? 'O servidor recusou o ficheiro.'));
          else if (!body.id || !body.url) reject(new Error('O servidor não confirmou o ficheiro.'));
          else resolve(body);
        } catch { reject(new Error('Resposta inválida ao carregar o ficheiro.')); }
      };
      request.send(JSON.stringify({ mimeType: file.type, base64: String(reader.result).split(',')[1] }));
    };
    reader.readAsDataURL(file);
  });
}
