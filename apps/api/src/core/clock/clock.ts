/**
 * O relógio é injectado para que nenhum domínio chame `new Date()` e nenhum
 * teste de prazo tenha de esperar tempo real.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Duplo de teste: o tempo só avança quando o teste o mandar avançar. */
export class FixedClock extends Clock {
  private current: Date;

  constructor(start: Date = new Date('2026-09-17T09:00:00.000Z')) {
    super();
    this.current = start;
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceHours(hours: number): void {
    this.advanceMs(hours * 60 * 60 * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.advanceMs(minutes * 60 * 1000);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
