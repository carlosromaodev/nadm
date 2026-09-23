import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Env } from './core/config/env';
import { DomainExceptionFilter } from './core/http/domain-exception.filter';
import { StructuredLogger } from './core/logging/structured.logger';

async function bootstrap(): Promise<void> {
  // `rawBody` é preciso para verificar a assinatura dos webhooks do parceiro
  // sobre os bytes exactos que ele enviou, e não sobre o JSON re-serializado.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    // Uma linha JSON por evento, já sem telefone completo, documento, destino
    // de levantamento nem conteúdo de mensagem (SDD §15.1).
    logger: new StructuredLogger(),
  });
  // Base64 tem overhead de 4/3; cada ficheiro é validado a 10 MiB após descodificar.
  app.useBodyParser('json', { limit: '15mb' });
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
