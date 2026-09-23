import { Injectable } from '@nestjs/common';
import { AvailabilityRepository } from '@/modules/profiles/application/ports/availability.repository';
import type { TxContext } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';

/**
 * Devolve a vaga de um pedido que morreu antes de haver trabalho.
 *
 * Corre em T3 (recusa), T6 (contraproposta recusada) e T13 (expiração), sempre
 * dentro da transacção de quem fecha o `Deal` — a vaga e o estado voltam
 * juntos, ou não volta nenhum.
 *
 * **Não corre em T15 nem T16.** Uma devolução depois de o criador ter aceitado
 * significa que o tempo foi reservado e, na prática, gasto: a vaga não volta ao
 * mercado como se nada tivesse acontecido. Quem decide reabri-la é o criador,
 * abrindo outra janela.
 */
@Injectable()
export class SlotReleaseService {
  constructor(private readonly availability: AvailabilityRepository) {}

  async releaseFor(deal: Deal, tx: TxContext): Promise<void> {
    if (!deal.windowId) return;

    await this.availability.releaseSlot(deal.windowId, tx);
  }
}
