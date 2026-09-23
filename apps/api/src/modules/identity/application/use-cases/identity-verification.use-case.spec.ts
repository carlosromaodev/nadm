import { beforeEach, describe, expect, it } from 'vitest';
import {
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  InvalidVerificationTransitionError,
  RejectionReasonRequiredError,
  maskDocumentNumber,
} from '../../domain/identity-verification';
import {
  ListMyIdentityVerificationsUseCase,
  ListPendingIdentityVerificationsUseCase,
  ReviewIdentityVerificationUseCase,
  SubmitIdentityVerificationUseCase,
} from './identity-verification.use-case';

const DOCUMENTO = '003456789LA041';

describe('verificação de identidade (F5)', () => {
  let ctx: TestContext;
  let submit: SubmitIdentityVerificationUseCase;
  let review: ReviewIdentityVerificationUseCase;
  let listMine: ListMyIdentityVerificationsUseCase;
  let queue: ListPendingIdentityVerificationsUseCase;

  beforeEach(() => {
    ctx = makeTestContext();

    submit = new SubmitIdentityVerificationUseCase(
      ctx.transactions,
      ctx.identityVerifications,
      ctx.outbox,
      ctx.auditLog,
      ctx.ids,
      ctx.clock,
    );

    review = new ReviewIdentityVerificationUseCase(
      ctx.transactions,
      ctx.identityVerifications,
      ctx.users,
      ctx.outbox,
      ctx.auditLog,
      ctx.clock,
    );

    listMine = new ListMyIdentityVerificationsUseCase(ctx.identityVerifications);
    queue = new ListPendingIdentityVerificationsUseCase(ctx.identityVerifications);

    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedUser({ id: 'admin' });
  });

  const submeter = (actorUserId = 'creator') =>
    submit.execute({
      actorUserId,
      documentType: 'BI',
      documentNumber: DOCUMENTO,
      fullName: 'Nelson Domingos',
    });

  describe('submeter', () => {
    it('fica à espera de decisão', async () => {
      const verification = await submeter();

      expect(verification.status).toBe('PENDING');
      expect(await ctx.identityVerifications.findPendingByUser('creator')).not.toBeNull();
    });

    it('não permite duas submissões à espera ao mesmo tempo', async () => {
      await submeter();

      await expect(submeter()).rejects.toThrow(ResourceConflictError);
    });

    it('não eleva o nível de verificação por si só', async () => {
      await submeter();

      expect(ctx.db.users.get('creator')?.verificationLevel).toBe('PHONE');
    });

    it('a auditoria não guarda o número do documento', async () => {
      await submeter();

      const registo = ctx.db.auditLog.find((e) => e.action === 'identity.submitted')!;
      expect(JSON.stringify(registo.metadata)).not.toContain(DOCUMENTO);
    });

    it('mascara o número, deixando só os últimos três dígitos', () => {
      expect(maskDocumentNumber(DOCUMENTO)).toBe('•••••••••••041');
    });
  });

  describe('decidir', () => {
    it('aprovar eleva o nível para IDENTITY — e é a única coisa que o faz', async () => {
      const verification = await submeter();

      await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'approve',
      });

      expect(ctx.db.users.get('creator')?.verificationLevel).toBe('IDENTITY');
    });

    it('rejeitar exige motivo e não eleva nada', async () => {
      const verification = await submeter();

      await expect(
        review.execute({
          reviewerUserId: 'admin',
          verificationId: verification.id,
          decision: 'reject',
          reason: '   ',
        }),
      ).rejects.toThrow(RejectionReasonRequiredError);

      const decidida = await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'reject',
        reason: 'A foto do documento está ilegível.',
      });

      expect(decidida.status).toBe('REJECTED');
      expect(ctx.db.users.get('creator')?.verificationLevel).toBe('PHONE');
    });

    it('depois de rejeitada, o criador pode submeter de novo', async () => {
      const verification = await submeter();

      await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'reject',
        reason: 'A foto do documento está ilegível.',
      });

      await expect(submeter()).resolves.toBeDefined();
    });

    it('uma verificação já decidida não se decide outra vez', async () => {
      const verification = await submeter();

      await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'approve',
      });

      await expect(
        review.execute({
          reviewerUserId: 'admin',
          verificationId: verification.id,
          decision: 'reject',
          reason: 'mudei de ideias',
        }),
      ).rejects.toThrow(InvalidVerificationTransitionError);
    });

    it('decidir uma verificação que não existe é 404', async () => {
      await expect(
        review.execute({
          reviewerUserId: 'admin',
          verificationId: 'nao-existe',
          decision: 'approve',
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('a auditoria diz quem decidiu e sobre quem', async () => {
      const verification = await submeter();

      await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'approve',
      });

      const registo = ctx.db.auditLog.find((e) => e.action === 'identity.approved')!;
      expect(registo.actorUserId).toBe('admin');
      expect(registo.metadata).toMatchObject({ subjectUserId: 'creator' });
    });
  });

  describe('listagens', () => {
    it('o criador vê o seu histórico', async () => {
      await submeter();

      expect(await listMine.execute({ actorUserId: 'creator' })).toHaveLength(1);
      expect(await listMine.execute({ actorUserId: 'admin' })).toHaveLength(0);
    });

    it('a fila da administração mostra as que esperam decisão', async () => {
      const verification = await submeter();

      expect(await queue.execute()).toHaveLength(1);

      await review.execute({
        reviewerUserId: 'admin',
        verificationId: verification.id,
        decision: 'approve',
      });

      expect(await queue.execute()).toHaveLength(0);
    });
  });
});
