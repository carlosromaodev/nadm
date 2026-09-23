import { Module } from '@nestjs/common';
import { IdentityModule } from '@/modules/identity/identity.module';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import { ContentAccess } from './application/content-access';
import {
  ContentRepository,
  MediaUrlSigner,
  PrivateMediaStorage,
} from './application/ports/content.repository';
import { GetContentUseCase } from './application/use-cases/get-content.use-case';
import { ListContentUseCase } from './application/use-cases/list-content.use-case';
import { ReadMediaUseCase } from './application/use-cases/read-media.use-case';
import { SaveContentUseCase } from './application/use-cases/save-content.use-case';
import { UploadMediaUseCase } from './application/use-cases/upload-media.use-case';
import { ContentController } from './http/content.controller';
import {
  LocalMediaUrlSigner,
  LocalPrivateMediaStorage,
} from './infra/local-private-media';
import { PrismaContentRepository } from './infra/prisma-content.repository';

@Module({
  imports: [ProfilesModule, IdentityModule],
  controllers: [ContentController],
  providers: [
    { provide: ContentRepository, useClass: PrismaContentRepository },
    // O armazenamento de objectos é DP-13 e não está decidido. Até lá, disco
    // local fora do webroot — com a mesma porta que o fornecedor real usará.
    { provide: PrivateMediaStorage, useClass: LocalPrivateMediaStorage },
    { provide: MediaUrlSigner, useClass: LocalMediaUrlSigner },
    ContentAccess,
    UploadMediaUseCase,
    SaveContentUseCase,
    ListContentUseCase,
    GetContentUseCase,
    ReadMediaUseCase,
  ],
  exports: [ContentRepository, ContentAccess],
})
export class ContentModule {}
