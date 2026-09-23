import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Roles } from '@/core/auth/roles.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  GetPlatformMetricsUseCase,
  QueryAuditUseCase,
  ReinstateUserUseCase,
  SuspendUserUseCase,
} from '../application/use-cases/admin-ops.use-case';
import {
  CloseFindingUseCase,
  ListFindingsUseCase,
} from '../application/use-cases/manage-findings.use-case';
import { RunReconciliationUseCase } from '../application/use-cases/run-reconciliation.use-case';
import { FINDING_STATUSES, type ReconciliationFinding } from '../domain/reconciliation';

const findingsQuerySchema = z.object({
  status: z.enum(FINDING_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const closeFindingSchema = z
  .object({
    outcome: z.enum(['RESOLVED', 'ACCEPTED']),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();

const suspendSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
const reinstateSchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();

const auditQuerySchema = z.object({
  subjectType: z.string().trim().min(1).max(60).optional(),
  subjectId: z.string().trim().min(1).max(100).optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

function presentFinding(finding: ReconciliationFinding) {
  const props = finding.toProps();

  return {
    id: props.id,
    kind: props.kind,
    severity: props.severity,
    status: props.status,
    subjectType: props.subjectType,
    subjectId: props.subjectId,
    detail: props.detail,
    metadata: props.metadata,
    detectedAt: props.detectedAt.toISOString(),
    resolvedAt: props.resolvedAt?.toISOString() ?? null,
    resolutionNote: props.resolutionNote,
  };
}

/**
 * A operação da plataforma.
 *
 * Tudo aqui é `/admin/**`, o único sítio onde o papel decide o acesso. Ler a
 * auditoria, ver as divergências e suspender contas são actos que só se
 * justificam com o cargo — em todo o resto do sistema a pergunta é a relação
 * com o recurso.
 */
@Controller('admin')
@Roles('ADMIN')
export class AdminOpsController {
  constructor(
    private readonly listFindings: ListFindingsUseCase,
    private readonly closeFinding: CloseFindingUseCase,
    private readonly reconciliation: RunReconciliationUseCase,
    private readonly suspend: SuspendUserUseCase,
    private readonly reinstate: ReinstateUserUseCase,
    private readonly audit: QueryAuditUseCase,
    private readonly metrics: GetPlatformMetricsUseCase,
  ) {}

  @Get('reconciliation')
  async findings(
    @Query(new ZodValidationPipe(findingsQuerySchema)) query: z.infer<typeof findingsQuerySchema>,
  ) {
    const findings = await this.listFindings.execute({
      status: query.status,
      limit: query.limit,
    });

    return { data: findings.map(presentFinding) };
  }

  /**
   * Corre a reconciliação agora, sem esperar pelo agendador.
   *
   * É leitura e registo, nunca correcção: uma pessoa que carregue nisto duas
   * vezes não produz divergências a dobrar.
   */
  @Post('reconciliation/run')
  @HttpCode(200)
  async run() {
    return this.reconciliation.execute();
  }

  @Post('reconciliation/:id/close')
  @HttpCode(200)
  async close(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeFindingSchema)) body: z.infer<typeof closeFindingSchema>,
  ) {
    return presentFinding(
      await this.closeFinding.execute({
        reviewerUserId: auth.userId,
        findingId: id,
        outcome: body.outcome,
        note: body.note,
      }),
    );
  }

  @Post('users/:id/suspend')
  @HttpCode(204)
  async suspendUser(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(suspendSchema)) body: z.infer<typeof suspendSchema>,
  ) {
    await this.suspend.execute({
      reviewerUserId: auth.userId,
      userId: id,
      reason: body.reason,
    });
  }

  @Post('users/:id/reinstate')
  @HttpCode(204)
  async reinstateUser(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reinstateSchema)) body: z.infer<typeof reinstateSchema>,
  ) {
    await this.reinstate.execute({
      reviewerUserId: auth.userId,
      userId: id,
      note: body.note,
    });
  }

  @Get('audit')
  async auditTrail(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ) {
    const entries = await this.audit.execute(query);

    return {
      data: entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  @Get('metrics')
  async platformMetrics() {
    return this.metrics.execute();
  }
}
