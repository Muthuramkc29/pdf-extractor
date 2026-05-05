import { z, type ZodTypeAny } from 'zod';
import type { FieldSchema } from '@/types';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildFieldZod(field: FieldSchema): ZodTypeAny {
  const v = field.validation ?? {};

  switch (field.type) {
    case 'checkbox':
      return field.required ? z.literal(true, { errorMap: () => ({ message: 'Required' }) }) : z.boolean();

    case 'number': {
      // Allow empty string in the form input; coerce to number for validation.
      let num = z.coerce.number({ invalid_type_error: 'Must be a number' });
      if (v.min !== undefined) num = num.min(v.min, `Must be ≥ ${v.min}`);
      if (v.max !== undefined) num = num.max(v.max, `Must be ≤ ${v.max}`);
      const schema: ZodTypeAny = field.required
        ? num
        : z.union([z.literal(''), num]).transform((val) => (val === '' ? undefined : val));
      return schema;
    }

    case 'select': {
      if (field.options && field.options.length) {
        const enumSchema = z.enum(field.options as [string, ...string[]]);
        return field.required ? enumSchema : enumSchema.or(z.literal(''));
      }
      return field.required ? z.string().min(1, 'Required') : z.string();
    }

    case 'date': {
      // Accept dd/mm/yyyy or yyyy-mm-dd; we keep it permissive.
      const dateStr = z
        .string()
        .regex(/^(\d{2}\/\d{2}\/\d{2,4}|\d{4}-\d{2}-\d{2})$/u, 'Invalid date');
      return field.required ? dateStr : z.union([z.literal(''), dateStr]);
    }

    case 'textarea':
    case 'text':
    default: {
      let s = z.string();
      if (v.minLength) s = s.min(v.minLength, `Min ${v.minLength} characters`);
      if (v.maxLength) s = s.max(v.maxLength, `Max ${v.maxLength} characters`);
      if (v.pattern) {
        try {
          const re = new RegExp(v.pattern);
          s = s.regex(re, 'Invalid format');
        } catch {
          // ignore bad pattern
        }
      }
      // Heuristic: a label containing "email" gets email validation automatically.
      if (/email/i.test(field.label)) s = s.regex(emailRegex, 'Invalid email');
      return field.required ? s.min(1, 'Required') : s;
    }
  }
}

export function buildZodSchema(fields: FieldSchema[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) shape[f.id] = buildFieldZod(f);
  return z.object(shape);
}
