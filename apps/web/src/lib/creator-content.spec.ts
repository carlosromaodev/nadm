import { describe, expect, it } from 'vitest';
import { contentValidation, emptyContentDraft, type CreatorMedia } from './creator-content';

const image: CreatorMedia = { id: 'image', mimeType: 'image/png', url: '/private/image' };
const video: CreatorMedia = { id: 'video', mimeType: 'video/mp4', url: '/private/video' };
describe('creator content validation', () => {
  it('allows incomplete private drafts', () => { expect(contentValidation(emptyContentDraft(), [], false)).toBeNull(); });
  it('does not publish without caption or confirmed media', () => {
    expect(contentValidation(emptyContentDraft(), [image], true)).toContain('legenda');
    expect(contentValidation({ ...emptyContentDraft(), caption: 'Foto' }, [], true)).toContain('ficheiro');
  });
  it('só a publicação para membros continua fechada — vender à unidade funciona', () => {
    const base = { ...emptyContentDraft(), caption: 'Foto' };

    expect(contentValidation({ ...base, visibility: 'MEMBERS' }, [image], true)).toContain(
      'não está disponível',
    );
    expect(
      contentValidation({ ...base, visibility: 'PAID', priceMinor: '350000' }, [image], true),
    ).toBeNull();
  });
  it('validates content type and media count', () => {
    const draft = { ...emptyContentDraft(), caption: 'A minha foto' };
    expect(contentValidation(draft, [image], true)).toBeNull();
    expect(contentValidation(draft, [image, image], true)).toContain('exactamente');
    expect(contentValidation({ ...draft, kind: 'VIDEO' }, [image], true)).toContain('vídeo');
    expect(contentValidation({ ...draft, kind: 'PLAYLIST' }, [video, image], true)).toContain('só pode conter vídeos');
    expect(contentValidation({ ...draft, kind: 'PLAYLIST' }, [video], true)).toBeNull();
  });
});

describe('contentValidation · venda de conteúdo', () => {
  const media = [{ id: 'm1', mimeType: 'image/jpeg', url: '/api/media/m1?token=x' }];
  const base = {
    ...emptyContentDraft(),
    caption: 'Ensaio',
    mediaIds: ['m1'],
  };

  it('deixa publicar conteúdo pago com preço', () => {
    expect(
      contentValidation({ ...base, visibility: 'PAID', priceMinor: '1800000' }, media, true),
    ).toBeNull();
  });

  it('recusa conteúdo pago sem preço', () => {
    expect(contentValidation({ ...base, visibility: 'PAID', priceMinor: '0' }, media, true)).toBe(
      'Uma publicação paga precisa de um preço.',
    );
  });

  it('continua a recusar publicação para membros — é DP-09', () => {
    expect(
      contentValidation({ ...base, visibility: 'MEMBERS', priceMinor: '1800000' }, media, true),
    ).toContain('membros');
  });

  it('um rascunho não é validado como publicação', () => {
    expect(contentValidation({ ...base, visibility: 'MEMBERS' }, [], false)).toBeNull();
  });
});
