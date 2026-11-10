import { z } from 'zod';

export function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parseId(value: string | undefined) {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
