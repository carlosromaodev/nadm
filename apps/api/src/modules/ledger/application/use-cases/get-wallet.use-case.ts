import { Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import { Clock } from '@/core/clock/clock';
import {
  LedgerRepository,
  WalletsRepository,
  type LedgerEntryView,
  type WalletView,
} from '../ports/ledger.repository';

export interface GetWalletInput {
  actorUserId: string;
  entryLimit?: number;
}

export interface WalletDetail {
  wallet: WalletView;
  entries: LedgerEntryView[];
}

/**
 * O saldo é sempre recalculado a partir do razão, nunca lido de um campo
 * guardado (RN-103). A projecção existe por desempenho de listagem, não como
 * fonte de verdade.
 */
@Injectable()
export class GetWalletUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: ProfilesRepository,
    private readonly wallets: WalletsRepository,
    private readonly ledger: LedgerRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetWalletInput): Promise<WalletDetail> {
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', input.actorUserId);
      }

      return {
        wallet: await this.wallets.recomputeFromLedger(profile.id, this.clock.now(), tx),
        entries: await this.ledger.listBySubject(profile.id, input.entryLimit ?? 50, tx),
      };
    });
  }
}
