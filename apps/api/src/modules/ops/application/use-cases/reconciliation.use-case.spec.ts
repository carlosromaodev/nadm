import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { ReconciliationQueries } from '../ports/reconciliation.repository';
import {
  FindingNotOpenError,
  ResolutionNoteRequiredError,
  SEVERITY_BY_KIND,
  fingerprint,
} from '../../domain/reconciliation';
import { CloseFindingUseCase, ListFindingsUseCase } from './manage-findings.use-case';
import { RunReconciliationUseCase } from './run-reconciliation.use-case';

/**
 * As consultas cruzadas são SQL sobre tabelas inteiras, e é contra Postgres que
 * se provam — ver o e2e. Aqui o que se testa é o que a tarefa **faz** com o que
 * elas devolvem: registar sem duplicar, classificar e alertar.
 */
class ConsultasFalsas extends ReconciliationQueries {
  intents: Array<{ id: string; dealId: string; since: Date }> = [];
  capturas: Array<{ dealId: string; intentId: string; capturedAt: Date }> = [];
  carteiras: Array<{ profileId: string; ledgerMinor: bigint; walletMinor: bigint }> = [];
  payouts: Array<{ id: string; profileId: string; since: Date }> = [];
  desequilibradas: Array<{ transactionId: string; differenceMinor: bigint }> = [];
  escrows: Array<{ dealId: string; reference: string; heldMinor: bigint }> = [];

  async stuckPaymentIntents() {
    return this.intents;
  }
  async capturesWithoutLedger() {
    return this.capturas;
  }
  async walletDivergences() {
    return this.carteiras;
  }
  async stuckPayouts() {
    return this.payouts;
  }
  async unbalancedLedgerTransactions() {
    return this.desequilibradas;
  }
  async escrowOnClosedDeals() {
    return this.escrows;
  }
}

describe('reconciliação (F10)', () => {
  let ctx: TestContext;
  let consultas: ConsultasFalsas;
  let correr: RunReconciliationUseCase;
  let listar: ListFindingsUseCase;
  let fechar: CloseFindingUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    consultas = new ConsultasFalsas();

    correr = new RunReconciliationUseCase(
      ctx.transactions,
      ctx.findings,
      consultas,
      ctx.outbox,
      ctx.auditLog,
      ctx.ids,
      ctx.clock,
    );
    listar = new ListFindingsUseCase(ctx.findings);
    fechar = new CloseFindingUseCase(ctx.transactions, ctx.findings, ctx.auditLog, ctx.clock);

    ctx.seedUser({ id: 'admin' });
  });

  describe('detectar', () => {
    it('sem divergências, não regista nem alerta nada', async () => {
      const resultado = await correr.execute();

      expect(resultado).toEqual({ detected: 0, repeated: 0, critical: 0 });
      expect(ctx.db.outbox).toHaveLength(0);
      expect(ctx.db.auditLog).toHaveLength(0);
    });

    it('regista uma intenção presa, como aviso', async () => {
      consultas.intents = [{ id: 'pi-1', dealId: 'd-1', since: ctx.clock.now() }];

      const resultado = await correr.execute();

      expect(resultado.detected).toBe(1);
      expect(resultado.critical).toBe(0);

      const [finding] = await listar.execute();
      expect(finding.kind).toBe('STUCK_PAYMENT_INTENT');
      expect(finding.severity).toBe('WARNING');
    });

    it('um razão desequilibrado é crítico e alerta', async () => {
      consultas.desequilibradas = [{ transactionId: 'tx-1', differenceMinor: 100n }];

      const resultado = await correr.execute();

      expect(resultado.critical).toBe(1);
      expect(ctx.db.outbox).toContainEqual(
        expect.objectContaining({
          type: 'reconciliation.finding_detected',
          payload: expect.objectContaining({ severity: 'CRITICAL' }),
        }),
      );
    });

    it('uma carteira divergente do razão é crítica', async () => {
      consultas.carteiras = [
        { profileId: 'p-1', ledgerMinor: 4_750_000n, walletMinor: 99_999n },
      ];

      const resultado = await correr.execute();

      const [finding] = await listar.execute();
      expect(finding.kind).toBe('WALLET_DIVERGENCE');
      expect(resultado.critical).toBe(1);
      // Os dois números ficam guardados: é o que permite perceber o tamanho.
      expect(finding.toProps().metadata).toEqual({
        ledgerMinor: '4750000',
        walletMinor: '99999',
      });
    });

    it('detecta os seis tipos de cruzamento na mesma passagem', async () => {
      consultas.intents = [{ id: 'pi-1', dealId: 'd-1', since: ctx.clock.now() }];
      consultas.capturas = [{ dealId: 'd-2', intentId: 'pi-2', capturedAt: ctx.clock.now() }];
      consultas.carteiras = [{ profileId: 'p-1', ledgerMinor: 1n, walletMinor: 2n }];
      consultas.payouts = [{ id: 'po-1', profileId: 'p-1', since: ctx.clock.now() }];
      consultas.desequilibradas = [{ transactionId: 'tx-1', differenceMinor: 5n }];
      consultas.escrows = [{ dealId: 'd-3', reference: 'NDM-1', heldMinor: 100n }];

      const resultado = await correr.execute();

      expect(resultado.detected).toBe(6);
      // Quatro dos seis são dinheiro que não bate certo.
      expect(resultado.critical).toBe(4);
    });

    it('a severidade de cada tipo está declarada, não inventada por caso', () => {
      expect(SEVERITY_BY_KIND.UNBALANCED_LEDGER).toBe('CRITICAL');
      expect(SEVERITY_BY_KIND.STUCK_PAYMENT_INTENT).toBe('WARNING');
    });
  });

  describe('a tarefa corre todos os dias sobre os mesmos dados', () => {
    it('a mesma divergência não se regista duas vezes', async () => {
      consultas.intents = [{ id: 'pi-1', dealId: 'd-1', since: ctx.clock.now() }];

      await correr.execute();
      const segunda = await correr.execute();

      expect(segunda.detected).toBe(0);
      expect(segunda.repeated).toBe(1);
      expect(await listar.execute()).toHaveLength(1);
    });

    it('fechada a divergência, a mesma condição volta a ser registada', async () => {
      consultas.intents = [{ id: 'pi-1', dealId: 'd-1', since: ctx.clock.now() }];

      await correr.execute();
      const [aberta] = await listar.execute();

      await fechar.execute({
        reviewerUserId: 'admin',
        findingId: aberta.id,
        outcome: 'RESOLVED',
        note: 'O parceiro confirmou a captura.',
      });

      // Se a condição persistir, tem de voltar a aparecer: fechar não é curar.
      const terceira = await correr.execute();
      expect(terceira.detected).toBe(1);
    });

    it('a impressão digital é o tipo mais o sujeito', () => {
      expect(fingerprint('STUCK_PAYOUT', 'po-1')).toBe('STUCK_PAYOUT:po-1');
    });
  });

  describe('fechar', () => {
    async function umaAberta() {
      consultas.intents = [{ id: 'pi-1', dealId: 'd-1', since: ctx.clock.now() }];
      await correr.execute();
      const [finding] = await listar.execute();
      return finding;
    }

    it('resolvida guarda quem foi e o que fez', async () => {
      const aberta = await umaAberta();

      const fechada = await fechar.execute({
        reviewerUserId: 'admin',
        findingId: aberta.id,
        outcome: 'RESOLVED',
        note: 'O parceiro confirmou a captura.',
      });

      const props = fechada.toProps();
      expect(props.status).toBe('RESOLVED');
      expect(props.resolvedByUserId).toBe('admin');
      expect(props.resolutionNote).toBe('O parceiro confirmou a captura.');
    });

    it('aceite é diferente de resolvida, e a diferença fica registada', async () => {
      const aberta = await umaAberta();

      const fechada = await fechar.execute({
        reviewerUserId: 'admin',
        findingId: aberta.id,
        outcome: 'ACCEPTED',
        note: 'Conhecido; o parceiro está a recuperar de uma falha.',
      });

      expect(fechada.toProps().status).toBe('ACCEPTED');
    });

    it('não se fecha sem dizer o que se fez', async () => {
      const aberta = await umaAberta();

      await expect(
        fechar.execute({
          reviewerUserId: 'admin',
          findingId: aberta.id,
          outcome: 'RESOLVED',
          note: '   ',
        }),
      ).rejects.toThrow(ResolutionNoteRequiredError);
    });

    it('não se fecha duas vezes', async () => {
      const aberta = await umaAberta();

      await fechar.execute({
        reviewerUserId: 'admin',
        findingId: aberta.id,
        outcome: 'RESOLVED',
        note: 'Tratado.',
      });

      await expect(
        fechar.execute({
          reviewerUserId: 'admin',
          findingId: aberta.id,
          outcome: 'ACCEPTED',
          note: 'Outra vez.',
        }),
      ).rejects.toThrow(FindingNotOpenError);
    });

    it('fechar uma que não existe é 404', async () => {
      await expect(
        fechar.execute({
          reviewerUserId: 'admin',
          findingId: 'nao-existe',
          outcome: 'RESOLVED',
          note: 'Tratado.',
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('fica na auditoria, com o tipo e a gravidade', async () => {
      const aberta = await umaAberta();

      await fechar.execute({
        reviewerUserId: 'admin',
        findingId: aberta.id,
        outcome: 'RESOLVED',
        note: 'Tratado.',
      });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'reconciliation.resolved',
          actorUserId: 'admin',
          metadata: expect.objectContaining({ kind: 'STUCK_PAYMENT_INTENT' }),
        }),
      );
    });
  });
});

