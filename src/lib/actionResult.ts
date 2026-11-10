import type { ZodError } from 'zod';

export type ActionResult = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const idleResult: ActionResult = { status: 'idle' };

export function failure(message: string): ActionResult {
  return { status: 'error', message };
}

export function success(message: string): ActionResult {
  return { status: 'success', message };
}

export function validationFailure(error: ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    fieldErrors[field] ??= issue.message;
  }

  return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
}

type DatabaseError = { code?: string; message: string };

// A row other records still point to. Postgres reports a protected link as 23001 and
// any other link as 23503.
export function isStillInUse(error: DatabaseError) {
  return error.code === '23503' || error.code === '23001';
}

// Messages raised by our own database rules are written for users, so they pass
// through. Anything else gets a safe, plain message.
export function databaseFailure(error: DatabaseError, conflictMessage = 'This already exists.'): ActionResult {
  if (error.code === '23505') return failure(conflictMessage);
  if (isStillInUse(error)) return failure('This is still in use, so it cannot be removed.');
  if (error.code === '23514') return failure(error.message);
  if (error.code === '42501') {
    return failure(
      error.message.includes('row-level security') || error.message.includes('permission denied')
        ? 'You do not have permission to do this.'
        : error.message,
    );
  }

  console.error('Database error', error);
  return failure('Something went wrong. Please try again.');
}
