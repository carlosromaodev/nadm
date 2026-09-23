export interface Delivery {
  readonly id: string;
  readonly dealId: string;
  readonly version: number;
  readonly note: string;
  readonly submittedAt: Date;
  readonly acceptedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly rejectionReason: string | null;
}
