import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().min(0),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value with coercions applied', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ name: 'Ana', age: '31' })).toEqual({
      name: 'Ana',
      age: 31,
    });
  });

  it('reports every failing field, not just the first one', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ name: 'A', age: -1 });
      expect.unreachable('pipe should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const body = (error as BadRequestException).getResponse() as {
        issues: Array<{ path: string }>;
      };

      expect(body.issues.map((issue) => issue.path).sort()).toEqual([
        'age',
        'name',
      ]);
    }
  });

  it('strips keys the schema does not declare', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ name: 'Ana', age: 31, role: 'admin' })).toEqual({
      name: 'Ana',
      age: 31,
    });
  });
});
