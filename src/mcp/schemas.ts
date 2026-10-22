import { z } from 'zod';

import { CLOCK_TIME, isValidDate } from '../time.ts';

export const isoDate = z
  .string()
  .refine(isValidDate, { message: 'must be a calendar date in YYYY-MM-DD format' });

export const clockTime = z.string().regex(CLOCK_TIME, 'must be a 24-hour time in HH:MM format');

export const medicationName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe('Medicine name, nickname or purpose as the parent said it, e.g. "BP tablet".');

export const shortText = (max: number) => z.string().trim().min(1).max(max);

export const periodDays = (fallback: number) =>
  z.int().min(1).max(31).default(fallback).describe('How many days back to look, including today.');
