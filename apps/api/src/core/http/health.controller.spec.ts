import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';
describe('HealthController', () => {
  it('identifica a API somente quando a base responde', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    expect(await new HealthController(prisma as unknown as PrismaService).check()).toEqual({ service: 'nadm-api', status: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
  it('falha sem divulgar a ligação ou o erro interno da base', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('private connection details')) };
    await expect(new HealthController(prisma as unknown as PrismaService).check()).rejects.toThrow(ServiceUnavailableException);
    await expect(new HealthController(prisma as unknown as PrismaService).check()).rejects.not.toThrow('private connection details');
  });
});
