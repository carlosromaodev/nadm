import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser, OptionalUser } from '@/core/auth/current-user.decorator';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { GetContentUseCase } from '../application/use-cases/get-content.use-case';
import { ListContentUseCase } from '../application/use-cases/list-content.use-case';
import { ReadMediaUseCase } from '../application/use-cases/read-media.use-case';
import { SaveContentUseCase } from '../application/use-cases/save-content.use-case';
import { UploadMediaUseCase } from '../application/use-cases/upload-media.use-case';

const uploadSchema = z
  .object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
    base64: z.string().min(1),
  })
  .strict();

const saveSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(['PHOTO', 'VIDEO', 'ALBUM', 'PLAYLIST']),
    caption: z.string().trim().max(300).default(''),
    visibility: z.enum(['PUBLIC', 'PAID', 'MEMBERS']),
    /** Cêntimos como string de inteiro. Número JSON é IEEE-754 (RN-111). */
    priceMinor: z.string().regex(/^\d+$/).default('0'),
    mediaIds: z.array(z.string().uuid()).max(20).default([]),
    previewMediaIds: z.array(z.string().uuid()).max(20).optional(),
    folder: z.string().trim().max(60).nullable().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']),
    scheduledAt: z.coerce.date().nullable().optional(),
  })
  .strict();

const mediaTokenSchema = z.object({ token: z.string().min(1).max(1500) });

@Controller()
export class ContentController {
  constructor(
    private readonly upload: UploadMediaUseCase,
    private readonly save: SaveContentUseCase,
    private readonly list: ListContentUseCase,
    private readonly get: GetContentUseCase,
    private readonly readMedia: ReadMediaUseCase,
  ) {}

  /**
   * Carregar um ficheiro.
   *
   * O corpo vem em base64 e o ficheiro é validado pelos **bytes**, não pelo
   * nome nem pelo tipo declarado — um SVG com extensão de imagem não passa.
   * O `storageKey` gerado nunca sai daqui: o que volta é uma URL assinada.
   */
  @Post('media')
  async uploadMedia(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(uploadSchema)) body: z.infer<typeof uploadSchema>,
  ) {
    return this.upload.execute(auth.userId, body);
  }

  /**
   * Serve o ficheiro, contra uma URL assinada.
   *
   * É **pública** de propósito: quem autoriza é a assinatura, não a sessão.
   * Sem isto, uma imagem numa página não carregava sem cabeçalhos — e a
   * assinatura leva o actor lá dentro, por isso o acesso continua a ser
   * verificado.
   */
  @Public()
  @Get('media/:id')
  @Header('Cache-Control', 'private, max-age=300')
  async serveMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(mediaTokenSchema)) query: z.infer<typeof mediaTokenSchema>,
    @Res() response: Response,
  ) {
    const { bytes, mimeType, byteSize } = await this.readMedia.execute(id, query.token);

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', byteSize);
    response.end(Buffer.from(bytes));
  }

  /**
   * Publicar ou actualizar.
   *
   * Vive em `/profiles/me/**` como as ofertas: é o catálogo **do próprio**, e o
   * caminho diz isso sem ser preciso ler o guarda.
   */
  @Post('profiles/me/content')
  async publish(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(saveSchema)) body: z.infer<typeof saveSchema>,
  ) {
    return this.save.execute(auth.userId, {
      ...body,
      folder: body.folder ?? null,
      scheduledAt: body.scheduledAt ?? null,
    });
  }

  /** O catálogo do próprio criador, rascunhos incluídos. */
  @Get('profiles/me/content')
  async mine(@CurrentUser() auth: AuthenticatedUser) {
    return this.list.execute({ ownUserId: auth.userId });
  }

  /**
   * O catálogo público de um perfil.
   *
   * Sem sessão devolve o que é público; com sessão, acrescenta o que essa
   * pessoa comprou. Quem decide é o `ContentGrant` e mais nada (RN-024).
   */
  @Public()
  @Get('profiles/:handle/content')
  async ofProfile(
    @Param('handle') handle: string,
    @OptionalUser() auth: AuthenticatedUser | undefined,
  ) {
    return this.list.execute({ handle, actorUserId: auth?.userId });
  }

  @Public()
  @Get('profiles/:handle/content/:id')
  async one(
    @Param('handle') handle: string,
    @Param('id', ParseUUIDPipe) id: string,
    @OptionalUser() auth: AuthenticatedUser | undefined,
  ) {
    return this.get.execute({ handle, id, actorUserId: auth?.userId });
  }
}
