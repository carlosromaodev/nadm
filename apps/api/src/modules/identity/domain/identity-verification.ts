import { BusinessRuleError } from '@/core/errors/domain-error';

export const IDENTITY_DOCUMENT_TYPES = ['BI', 'PASSPORT', 'NIF'] as const;

export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

export const IDENTITY_VERIFICATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];

export class InvalidVerificationTransitionError extends BusinessRuleError {
  constructor(from: IdentityVerificationStatus) {
    super(`An identity verification in ${from} can no longer be reviewed`);
  }
}

export class RejectionReasonRequiredError extends BusinessRuleError {
  constructor() {
    super('Rejecting an identity verification requires a reason');
  }
}

export interface IdentityVerificationProps {
  id: string;
  userId: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  fullName: string;
  status: IdentityVerificationStatus;
  reviewerUserId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  submittedAt: Date;
}

/**
 * Mostra só o suficiente para a pessoa reconhecer o documento que submeteu.
 *
 * O número completo nunca sai da API — nem para o próprio. Quem precisa dele é
 * a administração a olhar para o documento, não um ecrã.
 */
export function maskDocumentNumber(documentNumber: string): string {
  const limpo = documentNumber.replace(/\s+/g, '');

  return `${'•'.repeat(Math.max(0, limpo.length - 3))}${limpo.slice(-3)}`;
}

export class IdentityVerification {
  private constructor(private readonly props: IdentityVerificationProps) {}

  static submit(input: {
    id: string;
    userId: string;
    documentType: IdentityDocumentType;
    documentNumber: string;
    fullName: string;
    now: Date;
  }): IdentityVerification {
    return new IdentityVerification({
      id: input.id,
      userId: input.userId,
      documentType: input.documentType,
      documentNumber: input.documentNumber.replace(/\s+/g, ''),
      fullName: input.fullName.trim(),
      status: 'PENDING',
      reviewerUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      submittedAt: input.now,
    });
  }

  static reconstitute(props: IdentityVerificationProps): IdentityVerification {
    return new IdentityVerification(props);
  }

  /** Aprovar eleva o `verificationLevel` do utilizador — é isso que abre F5. */
  approve(reviewerUserId: string, now: Date): void {
    this.assertPending();

    this.props.status = 'APPROVED';
    this.props.reviewerUserId = reviewerUserId;
    this.props.reviewedAt = now;
  }

  reject(reviewerUserId: string, reason: string, now: Date): void {
    this.assertPending();

    if (!reason.trim()) {
      throw new RejectionReasonRequiredError();
    }

    this.props.status = 'REJECTED';
    this.props.reviewerUserId = reviewerUserId;
    this.props.reviewedAt = now;
    this.props.rejectionReason = reason.trim();
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get status(): IdentityVerificationStatus {
    return this.props.status;
  }

  get maskedDocumentNumber(): string {
    return maskDocumentNumber(this.props.documentNumber);
  }

  toProps(): IdentityVerificationProps {
    return { ...this.props };
  }

  private assertPending(): void {
    if (this.props.status !== 'PENDING') {
      throw new InvalidVerificationTransitionError(this.props.status);
    }
  }
}
