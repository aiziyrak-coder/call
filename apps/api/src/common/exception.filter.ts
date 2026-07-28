import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      // Production da to'liq getResponse() oshirilmasin — faqat validatsiya tafsiloti.
      let details: unknown;
      if (!this.isProd) {
        details = typeof payload === 'object' ? payload : undefined;
      } else if (
        typeof payload === 'object' &&
        payload &&
        'issues' in (payload as object)
      ) {
        details = { issues: (payload as { issues: unknown }).issues };
      }

      return {
        statusCode: status,
        message: Array.isArray(message) ? message.join('; ') : message,
        error: this.isProd ? undefined : exception.name,
        details,
        path,
        timestamp,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'maydon';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: this.isProd
            ? 'Bunday yozuv allaqachon mavjud'
            : `Bunday yozuv allaqachon mavjud (${target})`,
          error: this.isProd ? undefined : 'UniqueConstraintViolation',
          path,
          timestamp,
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Yozuv topilmadi',
          error: this.isProd ? undefined : 'NotFound',
          path,
          timestamp,
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ichki server xatosi',
      error: this.isProd ? undefined : 'InternalServerError',
      path,
      timestamp,
    };
  }
}
