import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { ReconciliationFinding, type FindingKind } from '../../domain/reconciliation';
import {
  FindingsRepository,
  ReconciliationQueries,
} from '../ports/reconciliation.repository';

const HORA = 60 * 60 * 1000;

/** Uma intenção que o parceiro não resolveu numa hora está presa. */
const INTENT_STUCK_HOURS = 1;
/** Um levantamento a caminho há mais de dois dias está preso. */
const PAYOUT_STUCK_HOURS = 48;

export interface ReconciliationResult {
  /** Divergências novas, que ainda não estavam registadas. */
  detected: number;
  /** Divergências que já estavam abertas e continuam a estar. */
  repeated: number;
  /** Quantas das novas são críticas — dinheiro que não bate certo. */
  critical: number;
}

/**
 * A tarefa que cruza o que o sistema diz com o que o sistema fez.
 *
 * Seis cruzamentos, os quatro do SDD §11.5 e mais dois que o sistema pode
 * verificar sobre si próprio sem depender do parceiro: o razão que não fecha em
 * zero e o escrow preso num negócio já fechado.
 *
 * **Não corrige nada.** Regista e alerta, e uma pessoa decide — porque uma
 * correcção automática de dinheiro é a maneira mais rápida de transformar uma
 * divergência numa perda.
 */
@Injectable()
export class RunReconciliationUseCase {
  private readonly logger = new Logger(RunReconciliationUseCase.name);

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly findings: FindingsRepository,
    private readonly queries: ReconciliationQueries,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ReconciliationResult> {
    const now = this.clock.now();
    const result: ReconciliationResult = { detected: 0, repeated: 0, critical: 0 };

    return this.transactions.run(async (tx) => {
      const candidatas = [
        ...(await this.intencoesPresas(now, tx)),
        ...(await this.capturasSemRazao(tx)),
        ...(await this.carteirasDivergentes(tx)),
        ...(await this.levantamentosPresos(now, tx)),
        ...(await this.razaoDesequilibrado(tx)),
        ...(await this.escrowEmNegocioFechado(tx)),
      ];

      for (const candidata of candidatas) {
        const finding = ReconciliationFinding.detect({
          id: this.ids.next(),
          now,
          ...candidata,
        });

        if (!(await this.findings.recordIfNew(finding, tx))) {
          result.repeated += 1;
          continue;
        }

        result.detected += 1;
        if (finding.severity === 'CRITICAL') result.critical += 1;

        await this.outbox.enqueue(
          {
            type: 'reconciliation.finding_detected',
            payload: {
              findingId: finding.id,
              kind: finding.kind,
              severity: finding.severity,
            },
            availableAt: now,
          },
          tx,
        );
      }

      if (result.detected > 0) {
        this.logger.warn(
          `Reconciliação: ${result.detected} divergências novas, ${result.critical} críticas.`,
        );

        await this.auditLog.record(
          {
            actorUserId: null,
            actorKind: 'SYSTEM',
            action: 'reconciliation.completed',
            subjectType: 'Platform',
            subjectId: 'reconciliation',
            metadata: {
              detected: String(result.detected),
              critical: String(result.critical),
            },
          },
          tx,
        );
      }

      return result;
    });
  }

  private async intencoesPresas(now: Date, tx: TxContext): Promise<Candidata[]> {
    const limite = new Date(now.getTime() - INTENT_STUCK_HOURS * HORA);

    return (await this.queries.stuckPaymentIntents(limite, tx)).map((intent) => ({
      kind: 'STUCK_PAYMENT_INTENT' as FindingKind,
      subjectType: 'PaymentIntent',
      subjectId: intent.id,
      detail:
        `A intenção de pagamento está por resolver desde ${intent.since.toISOString()}. ` +
        'Confirmar o estado junto do parceiro antes de fazer o que quer que seja.',
      metadata: { dealId: intent.dealId, since: intent.since.toISOString() },
    }));
  }

  private async capturasSemRazao(tx: TxContext): Promise<Candidata[]> {
    return (await this.queries.capturesWithoutLedger(tx)).map((captura) => ({
      kind: 'CAPTURE_WITHOUT_LEDGER' as FindingKind,
      subjectType: 'Deal',
      subjectId: captura.dealId,
      detail:
        'O pagamento está marcado como capturado e não há lançamento de entrada no razão. ' +
        'Ou o dinheiro entrou sem ser registado, ou a marca de captura está errada.',
      metadata: {
        intentId: captura.intentId,
        capturedAt: captura.capturedAt.toISOString(),
      },
    }));
  }

  private async carteirasDivergentes(tx: TxContext): Promise<Candidata[]> {
    return (await this.queries.walletDivergences(tx)).map((divergencia) => ({
      kind: 'WALLET_DIVERGENCE' as FindingKind,
      subjectType: 'Profile',
      subjectId: divergencia.profileId,
      detail:
        'O saldo do razão e a projecção da carteira discordam. O razão é a fonte de verdade ' +
        '(RN-103): a carteira recalcula-se a partir dele, nunca ao contrário.',
      metadata: {
        ledgerMinor: divergencia.ledgerMinor.toString(),
        walletMinor: divergencia.walletMinor.toString(),
      },
    }));
  }

  private async levantamentosPresos(now: Date, tx: TxContext): Promise<Candidata[]> {
    const limite = new Date(now.getTime() - PAYOUT_STUCK_HOURS * HORA);

    return (await this.queries.stuckPayouts(limite, tx)).map((payout) => ({
      kind: 'STUCK_PAYOUT' as FindingKind,
      subjectType: 'Payout',
      subjectId: payout.id,
      detail:
        `O levantamento está a caminho do parceiro desde ${payout.since.toISOString()}. ` +
        'Confirmar se saiu, antes de o marcar como falhado.',
      metadata: { profileId: payout.profileId, since: payout.since.toISOString() },
    }));
  }

  private async razaoDesequilibrado(tx: TxContext): Promise<Candidata[]> {
    return (await this.queries.unbalancedLedgerTransactions(tx)).map((transaccao) => ({
      kind: 'UNBALANCED_LEDGER' as FindingKind,
      subjectType: 'LedgerTransaction',
      subjectId: transaccao.transactionId,
      detail:
        'As entradas desta transacção não somam zero, o que RN-100 não admite. ' +
        'Corrigir é lançar um estorno, nunca alterar o que está lá.',
      metadata: { differenceMinor: transaccao.differenceMinor.toString() },
    }));
  }

  private async escrowEmNegocioFechado(tx: TxContext): Promise<Candidata[]> {
    return (await this.queries.escrowOnClosedDeals(tx)).map((deal) => ({
      kind: 'ESCROW_ON_CLOSED_DEAL' as FindingKind,
      subjectType: 'Deal',
      subjectId: deal.dealId,
      detail:
        `O pedido ${deal.reference} está fechado e ainda tem valor retido no escrow. ` +
        'Ou a libertação falhou a meio, ou o estorno não chegou a ser lançado.',
      metadata: { heldMinor: deal.heldMinor.toString() },
    }));
  }
}

interface Candidata {
  kind: FindingKind;
  subjectType: string;
  subjectId: string;
  detail: string;
  metadata: Record<string, string>;
}
