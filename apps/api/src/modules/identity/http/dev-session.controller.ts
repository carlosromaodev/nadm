import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { CreateDevSessionUseCase } from '../application/use-cases/create-dev-session.use-case';

export const createDevSessionSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(20).optional(),
  role: z.enum(['BUYER', 'CREATOR']),
}).strict();

@Controller('dev')
export class DevSessionController {
  constructor(private readonly createSession: CreateDevSessionUseCase) {}

  @Public()
  @Post('session')
  create(@Body(new ZodValidationPipe(createDevSessionSchema)) body: z.infer<typeof createDevSessionSchema>) {
    return this.createSession.execute(body);
  }
}
