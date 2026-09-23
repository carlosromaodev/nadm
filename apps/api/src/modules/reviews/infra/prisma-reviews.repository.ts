import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { clientFrom } from '@/core/database/prisma-transaction';
import type { TxContext } from '@/shared/application/transaction';
import { ReviewsRepository } from '../application/ports/reviews.repository';
import type { Review } from '../domain/review';
@Injectable()
export class PrismaReviewsRepository extends ReviewsRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  findByDeal(dealId: string, tx?: TxContext) { return clientFrom(this.prisma, tx).review.findUnique({ where: { dealId } }); }
  listByProfile(profileId: string, tx?: TxContext) { return clientFrom(this.prisma, tx).review.findMany({ where: { profileId }, orderBy: { publishedAt: 'desc' }, take: 100 }); }
  async createIfAbsent(review: Review, tx?: TxContext) {
    const client = clientFrom(this.prisma, tx);
    await client.review.createMany({ data: [review], skipDuplicates: true });
    return client.review.findUniqueOrThrow({ where: { dealId: review.dealId } });
  }

  saveReply(id: string, reply: string, repliedAt: Date, tx?: TxContext) {
    // Só estas duas colunas. A nota e o texto do comprador nem sequer estão no
    // alcance do papel da aplicação — ver o `GRANT UPDATE` da migração 016.
    return clientFrom(this.prisma, tx).review.update({
      where: { id },
      data: { reply, repliedAt },
    });
  }
}
