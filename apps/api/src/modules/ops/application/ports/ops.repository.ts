import type { TxContext } from '@/shared/application/transaction';

export interface AuditEntryView {
  id: string;
  actorUserId: string | null;
  actorKind: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditFilter {
  /** Sobre que recurso. Sem isto, a consulta é a fila geral, por ordem. */
  subjectType?: string;
  subjectId?: string;
  actorUserId?: string;
  action?: string;
  limit: number;
}

/**
 * A auditoria, do lado da leitura.
 *
 * Está à parte de `AuditLogRepository`, que só escreve, porque as duas coisas
 * têm donos diferentes: escrever é de todo o sistema, ler é da administração.
 */
export abstract class AuditQueries {
  abstract list(filter: AuditFilter, tx?: TxContext): Promise<AuditEntryView[]>;
}

export interface PlatformMetrics {
  negocio: {
    dealsCriados: number;
    dealsAceites: number;
    dealsConcluidos: number;
    dealsDisputados: number;
  };
  dinheiro: {
    /** Cêntimos, em string. Nunca número JSON (RN-111). */
    retidoMinor: string;
    libertadoMinor: string;
    devolvidoMinor: string;
  };
  integridade: {
    divergenciasAbertas: number;
    eventosPorProcessar: number;
    intencoesPresas: number;
  };
  filas: {
    disputasAbertas: number;
    levantamentosPorDecidir: number;
    identidadesPorDecidir: number;
  };
}

export abstract class MetricsQueries {
  abstract snapshot(now: Date, tx?: TxContext): Promise<PlatformMetrics>;
}
