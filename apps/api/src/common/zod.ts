import { BadRequestException, Injectable, ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema, z } from 'zod';

/**
 * Yengil zod <-> Nest ko'prigi. `nestjs-zod` paketi o'rniga ishlatiladi, chunki u
 * `@nestjs/swagger` ning ichki yo'llarini import qiladi va v11 bilan buziladi.
 */
export interface ZodDto<TSchema extends ZodSchema = ZodSchema> {
  new (): z.infer<TSchema>;
  readonly isZodDto: true;
  readonly schema: TSchema;
}

export function createZodDto<TSchema extends ZodSchema>(schema: TSchema): ZodDto<TSchema> {
  class Dto {
    static readonly isZodDto = true as const;
    static readonly schema = schema;
  }
  return Dto as unknown as ZodDto<TSchema>;
}

function isZodDto(metatype: unknown): metatype is ZodDto {
  return typeof metatype === 'function' && (metatype as { isZodDto?: boolean }).isZodDto === true;
}

/** Zod xatolarini `maydon: xabar` ko'rinishidagi o'qilishi oson ro'yxatga aylantiradi. */
export function formatZodError(error: ZodError): { message: string; details: string[] } {
  const details = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { message: details.join('; '), details };
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const { metatype } = metadata;
    if (!isZodDto(metatype)) return value;

    const result = metatype.schema.safeParse(value);
    if (!result.success) {
      const { message, details } = formatZodError(result.error);
      throw new BadRequestException({ message, details, error: 'ValidationError' });
    }
    return result.data;
  }
}

/**
 * Query va param obyektlarini bevosita sxema bilan tekshirish uchun.
 * Masalan: `@Query(new ZodQuery(listContactsSchema)) query: ListContactsQuery`
 */
@Injectable()
export class ZodQuery<TSchema extends ZodSchema> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const { message, details } = formatZodError(result.error);
      throw new BadRequestException({ message, details, error: 'ValidationError' });
    }
    return result.data;
  }
}
