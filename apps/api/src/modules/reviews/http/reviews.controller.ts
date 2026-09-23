import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { GetDealReviewUseCase, ListProfileReviewsUseCase, ReplyToReviewUseCase, SubmitReviewUseCase } from '../application/use-cases/reviews.use-case';
import { rateProfile, type Review } from '../domain/review';
const schema = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(2000).default('') }).strict();
const replySchema = z.object({ reply: z.string().trim().min(1).max(2000) }).strict();
function present(review: Review) { return { id: review.id, rating: review.rating, body: review.body, reply: review.reply, repliedAt: review.repliedAt?.toISOString() ?? null, publishedAt: review.publishedAt.toISOString() }; }
@Controller()
export class ReviewsController {
  constructor(private readonly submit: SubmitReviewUseCase, private readonly get: GetDealReviewUseCase, private readonly list: ListProfileReviewsUseCase, private readonly reply: ReplyToReviewUseCase) {}
  @Post('deals/:id/review')
  async create(@CurrentUser() auth: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>) { return present(await this.submit.execute({ actorUserId: auth.userId, dealId: id, ...body })); }
  @Get('deals/:id/review')
  async mine(@CurrentUser() auth: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { const review = await this.get.execute({ actorUserId: auth.userId, dealId: id }); return { review: review ? present(review) : null }; }
  /** A resposta do criador. Uma só, e não se apaga. */
  @Post('deals/:id/review/reply')
  @HttpCode(200)
  async answer(@CurrentUser() auth: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(replySchema)) body: z.infer<typeof replySchema>) { return present(await this.reply.execute({ actorUserId: auth.userId, dealId: id, reply: body.reply })); }

  @Public()
  @Get('profiles/:handle/reviews')
  async publicList(@Param('handle') handle: string) {
    const reviews = await this.list.execute(handle);

    // A média vai em décimas e em inteiros: comparar reputações com um número
    // que arredonda de maneiras diferentes conforme a plataforma não serve.
    return { data: reviews.map(present), rating: rateProfile(reviews.map((review) => review.rating)) };
  }
}
