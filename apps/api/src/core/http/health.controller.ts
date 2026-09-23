import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../database/prisma.service';

/** Readiness, not merely a listening TCP socket. Never returns connection details. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get()
  async check() {
    try { await this.prisma.$queryRaw`SELECT 1`; }
    catch { throw new ServiceUnavailableException('Base de dados indisponível.'); }
    return { service: 'nadm-api', status: 'ok' };
  }
}
