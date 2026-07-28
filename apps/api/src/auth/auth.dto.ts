import { z } from 'zod';
import { createZodDto } from '../common/zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export class LoginDto extends createZodDto(loginSchema) {}

export const verifyMfaSchema = z.object({
  mfaToken: z.string(),
  code: z.string().regex(/^\d{6}$/, '6 xonali kod kiriting'),
});
export class VerifyMfaDto extends createZodDto(verifyMfaSchema) {}

export const refreshSchema = z.object({
  refreshToken: z.string().optional().default(''),
});
export class RefreshDto extends createZodDto(refreshSchema) {}

export const confirmMfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export class ConfirmMfaDto extends createZodDto(confirmMfaSchema) {}

export const disableMfaSchema = z.object({
  password: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
});
export class DisableMfaDto extends createZodDto(disableMfaSchema) {}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z
      .string()
      .min(10, "Parol kamida 10 belgidan iborat bo'lsin")
      .regex(/[a-z]/, "Kichik harf bo'lishi kerak")
      .regex(/[A-Z]/, "Katta harf bo'lishi kerak")
      .regex(/\d/, "Raqam bo'lishi kerak"),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Yangi parol eskisidan farq qilishi kerak',
    path: ['newPassword'],
  });
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
