/**
 * Errors the domain layer is allowed to raise. They carry no HTTP knowledge —
 * the exception filter is what maps them onto status codes.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} "${id}" was not found`);
  }
}

export class ResourceConflictError extends DomainError {}

export class BusinessRuleError extends DomainError {}

/**
 * Para quando a existência do recurso não é segredo e o problema é o papel:
 * o comprador sabe que o pedido existe, só não é ele quem o aceita.
 *
 * Quem não é parte do recurso NÃO recebe isto — recebe `ResourceNotFoundError`,
 * porque um 403 confirmaria a existência de um negócio alheio (RN-063).
 */
export class ForbiddenActionError extends DomainError {}
