import { z } from 'zod';

export const FIELD_TYPES = ['text', 'number', 'checkbox', 'date', 'select', 'textarea'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
  })
  .partial()
  .optional();

export const FieldSchemaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  group: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  validation: FieldValidationSchema,
  // Anchor used by the client to compute pixel-precise bounding boxes via pdfjs.
  // `anchorText` should be a unique-ish printed phrase visible on the page near the field;
  // `page` is 1-indexed.
  page: z.number().int().min(1),
  // Direct bounding box (normalized 0..1 of the page, top-left origin). When
  // present this is used as-is. Provided by an OCR/Document AI step or a
  // vision-LLM that returns coordinates. Required for scanned/image-only PDFs
  // where pdfjs can't read a text layer.
  bbox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
  // Anchor-based resolution: a printed phrase visible on the page near the
  // field. Used when `bbox` isn't provided — pdfjs locates the phrase in the
  // text layer and we compute the bbox from its transform matrix. This is
  // pixel-precise but only works on PDFs with a real text layer.
  anchorText: z.string().min(1).optional(),
  anchorPlacement: z.enum(['over', 'right', 'below']).default('over').optional(),
  skipMatches: z.number().int().min(0).optional(),
  bboxHint: z
    .object({
      dx: z.number().default(0),
      dy: z.number().default(0),
      widthScale: z.number().default(1),
      heightScale: z.number().default(1),
    })
    .partial()
    .optional(),
}).refine((f) => f.bbox || f.anchorText, {
  message: 'Each field needs either a `bbox` or an `anchorText` for highlight resolution.',
});

export type FieldSchema = z.infer<typeof FieldSchemaSchema>;

export const ExtractedDocSchema = z.object({
  pdfUrl: z.string().min(1),
  pages: z.number().int().min(1),
  fields: z.array(FieldSchemaSchema),
});

export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;
