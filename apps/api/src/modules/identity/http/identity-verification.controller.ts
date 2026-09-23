import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Roles } from '@/core/auth/roles.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  ListMyIdentityVerificationsUseCase,
  ListPendingIdentityVerificationsUseCase,
  ReviewIdentityVerificationUseCase,
  SubmitIdentityVerificationUseCase,
} from '../application/use-cases/identity-verification.use-case';
import { IDENTITY_DOCUMENT_TYPES, type IdentityVerification } from '../domain/identity-verification';

const submitSchema = z.object({
  documentType: z.enum(IDENTITY_DOCUMENT_TYPES),
  documentNumber: z.string().trim().min(4).max(40),
  fullName: z.string().trim().min(2).max(160),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

/**
 * **O número do documento nunca sai daqui por inteiro** — nem para o próprio.
 * Só os últimos dígitos, que é quanto basta para reconhecer o que se submeteu.
 */
function present(verification: IdentityVerification) {
  const props = verification.toProps();

  return {
    id: props.id,
    documentType: props.documentType,
    documentNumber: verification.maskedDocumentNumber,
    fullName: props.fullName,
    status: props.status,
    rejectionReason: props.rejectionReason,
    submittedAt: props.submittedAt.toISOString(),
    reviewedAt: props.reviewedAt?.toISOString() ?? null,
  };
}

@Controller('identity-verifications')
export class IdentityVerificationController {
  constructor(
    private readonly submit: SubmitIdentityVerificationUseCase,
    private readonly listMine: ListMyIdentityVerificationsUseCase,
  ) {}

  @Post()
  async create(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitSchema)) body: z.infer<typeof submitSchema>,
  ) {
    return present(
      await this.submit.execute({
        actorUserId: auth.userId,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        fullName: body.fullName,
      }),
    );
  }

  @Get()
  async list(@CurrentUser() auth: AuthenticatedUser) {
    const verifications = await this.listMine.execute({ actorUserId: auth.userId });

    return { data: verifications.map(present) };
  }
}

/** A fila e a decisão. Papel decide aqui, e só aqui. */
@Controller('admin/identity-verifications')
@Roles('ADMIN')
export class AdminIdentityVerificationController {
  constructor(
    private readonly queue: ListPendingIdentityVerificationsUseCase,
    private readonly review: ReviewIdentityVerificationUseCase,
  ) {}

  @Get()
  async list() {
    const verifications = await this.queue.execute({});

    return { data: verifications.map(present) };
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return present(
      await this.review.execute({
        reviewerUserId: auth.userId,
        verificationId: id,
        decision: 'approve',
      }),
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectSchema)) body: z.infer<typeof rejectSchema>,
  ) {
    return present(
      await this.review.execute({
        reviewerUserId: auth.userId,
        verificationId: id,
        decision: 'reject',
        reason: body.reason,
      }),
    );
  }
}
