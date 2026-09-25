import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { DirectMessagesService } from './direct-messages.service';

const sendSchema = z.object({
  body: z.string().trim().min(1).max(1200),
  clientId: z.string().trim().min(8).max(100),
});
type SendBody = z.infer<typeof sendSchema>;

@Controller()
export class DirectMessagesController {
  constructor(private readonly directMessages: DirectMessagesService) {}

  @Get('profiles/:handle/direct-messages')
  async forCreator(@CurrentUser() auth: AuthenticatedUser, @Param('handle') handle: string) {
    return this.directMessages.forCreator(handle, auth.userId);
  }

  @Post('profiles/:handle/direct-messages')
  async start(@CurrentUser() auth: AuthenticatedUser, @Param('handle') handle: string,
    @Body(new ZodValidationPipe(sendSchema)) body: SendBody) {
    return this.directMessages.start(handle, auth.userId, body.body, body.clientId);
  }

  @Get('direct-conversations')
  async list(@CurrentUser() auth: AuthenticatedUser) {
    return { data: await this.directMessages.list(auth.userId) };
  }

  @Get('direct-conversations/:id')
  async one(@CurrentUser() auth: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.directMessages.byId(id, auth.userId);
  }

  @Post('direct-conversations/:id/messages')
  async reply(@CurrentUser() auth: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sendSchema)) body: SendBody) {
    return this.directMessages.reply(id, auth.userId, body.body, body.clientId);
  }
}
