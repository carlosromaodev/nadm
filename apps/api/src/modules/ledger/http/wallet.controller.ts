import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { GetWalletUseCase } from '../application/use-cases/get-wallet.use-case';

@Controller('wallet')
export class WalletController {
  constructor(private readonly getWallet: GetWalletUseCase) {}

  @Get()
  async wallet(@CurrentUser() auth: AuthenticatedUser) {
    const { wallet, entries } = await this.getWallet.execute({ actorUserId: auth.userId });

    return {
      available: { amount: wallet.available.amountMinor.toString(), currency: wallet.available.currency },
      reserved: { amount: wallet.reserved.amountMinor.toString(), currency: wallet.reserved.currency },
      pending: { amount: wallet.pending.amountMinor.toString(), currency: wallet.pending.currency },
      recomputedAt: wallet.recomputedAt.toISOString(),
      entries: entries.map((entry) => ({
        id: entry.id,
        description: entry.description,
        kind: entry.transactionKind,
        account: entry.account,
        direction: entry.direction,
        amount: { amount: entry.amount.amountMinor.toString(), currency: entry.amount.currency },
        dealId: entry.dealId,
        occurredAt: entry.occurredAt.toISOString(),
      })),
    };
  }
}
