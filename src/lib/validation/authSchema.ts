import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email });

const newPassword = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .regex(/[a-zA-Z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.');

export const setPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });

export const firstAccountSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your name.').max(120, 'Use 120 characters or fewer.'),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });
