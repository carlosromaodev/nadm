import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import {
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import {
  IdentityVerification,
  type IdentityDocumentType,
} from '../../domain/identity-verification';
import { IdentityVerificationsRepository } from '../ports/identity-verifications.repository';
import { UsersRepository } from '../ports/identity.repository';

export interface SubmitIdentityVerificationInput {
  actorUserId: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  fullName: string;
}

/**
 * O criador submete a identidade. É o que destranca os levantamentos (RN-051).
 *
 * O número do documento entra na base de dados e **não volta a sair** — nem
 * para o próprio. As leituras devolvem os últimos dígitos, que é quanto basta
 * para alguém reconhecer o que submeteu.
 */
@Injectable()
export class SubmitIdentityVerificationUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly verifications: IdentityVerificationsRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SubmitIdentityVerificationInput): Promise<IdentityVerification> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      // Reenviar o formulário não enche a fila da administração do mesmo
      // pedido. Quem o garante a sério é o índice único parcial de 014.
      const pendente = await this.verifications.findPendingByUser(input.actorUserId, tx);

      if (pendente) {
        throw new ResourceConflictError(
          'Já tens uma verificação de identidade à espera de decisão.',
        );
      }

      const verification = IdentityVerification.submit({
        id: this.ids.next(),
        userId: input.actorUserId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        fullName: input.fullName,
        now,
      });

      await this.verifications.create(verification, tx);

      await this.outbox.enqueue(
        {
          type: 'identity.submitted',
          payload: { verificationId: verification.id, userId: input.actorUserId },
          availableAt: now,
        },
        tx,
      );

      // Sem o número do documento na metadata: a auditoria diz que aconteceu,
      // não repete o dado sensível.
      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'identity.submitted',
          subjectType: 'IdentityVerification',
          subjectId: verification.id,
          metadata: { documentType: input.documentType },
        },
        tx,
      );

      return verification;
    });
  }
}

export interface ReviewIdentityVerificationInput {
  reviewerUserId: string;
  verificationId: string;
  decision: 'approve' | 'reject';
  reason?: string;
}

/**
 * A administração decide. Aprovar eleva o `verificationLevel` para `IDENTITY`,
 * e é a **única** coisa no sistema que o faz subir.
 *
 * O nível nunca vem do corpo do pedido nem de um caminho de utilizador: sem
 * isto, verificar-se a si próprio seria uma chamada HTTP.
 */
@Injectable()
export class ReviewIdentityVerificationUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly verifications: IdentityVerificationsRepository,
    private readonly users: UsersRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReviewIdentityVerificationInput): Promise<IdentityVerification> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const verification = await this.verifications.findById(input.verificationId, tx);

      if (!verification) {
        throw new ResourceNotFoundError('IdentityVerification', input.verificationId);
      }

      if (input.decision === 'approve') {
        verification.approve(input.reviewerUserId, now);
        await this.users.setVerificationLevel(verification.userId, 'IDENTITY', tx);
      } else {
        verification.reject(input.reviewerUserId, input.reason ?? '', now);
      }

      await this.verifications.save(verification, tx);

      await this.outbox.enqueue(
        {
          type: input.decision === 'approve' ? 'identity.approved' : 'identity.rejected',
          payload: { verificationId: verification.id, userId: verification.userId },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.reviewerUserId,
          actorKind: 'USER',
          action: `identity.${input.decision === 'approve' ? 'approved' : 'rejected'}`,
          subjectType: 'IdentityVerification',
          subjectId: verification.id,
          metadata: { subjectUserId: verification.userId },
        },
        tx,
      );

      return verification;
    });
  }
}

/** O histórico do próprio. A administração tem a sua fila noutra rota. */
@Injectable()
export class ListMyIdentityVerificationsUseCase {
  constructor(private readonly verifications: IdentityVerificationsRepository) {}

  execute(input: { actorUserId: string }): Promise<IdentityVerification[]> {
    return this.verifications.listByUser(input.actorUserId);
  }
}

/** A fila da administração, por ordem de chegada. */
@Injectable()
export class ListPendingIdentityVerificationsUseCase {
  constructor(private readonly verifications: IdentityVerificationsRepository) {}

  execute(input: { limit?: number } = {}): Promise<IdentityVerification[]> {
    return this.verifications.listByStatus('PENDING', input.limit ?? 50);
  }
}
