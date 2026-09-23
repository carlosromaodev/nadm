import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BusinessRuleError,
  DomainError,
  ForbiddenActionError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../errors/domain-error';

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statusFor(error);

    response.status(status).json({
      statusCode: status,
      error: error.name,
      message: error.message,
    });
  }
}

function statusFor(error: DomainError): number {
  if (error instanceof ResourceNotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ForbiddenActionError) return HttpStatus.FORBIDDEN;
  if (error instanceof ResourceConflictError) return HttpStatus.CONFLICT;
  if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.BAD_REQUEST;
}
