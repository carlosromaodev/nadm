import { Module } from '@nestjs/common';
import { DealsModule } from '@/modules/deals/deals.module';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import { ReviewsRepository } from './application/ports/reviews.repository';
import { GetDealReviewUseCase, GetProfileRatingUseCase, ListProfileReviewsUseCase, ReplyToReviewUseCase, SubmitReviewUseCase } from './application/use-cases/reviews.use-case';
import { ReviewsController } from './http/reviews.controller';
import { PrismaReviewsRepository } from './infra/prisma-reviews.repository';
@Module({ imports: [DealsModule, ProfilesModule], controllers: [ReviewsController], providers: [{ provide: ReviewsRepository, useClass: PrismaReviewsRepository }, SubmitReviewUseCase, GetDealReviewUseCase, ListProfileReviewsUseCase, ReplyToReviewUseCase, GetProfileRatingUseCase] })
export class ReviewsModule {}
