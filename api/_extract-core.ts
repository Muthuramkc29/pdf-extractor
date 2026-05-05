/**
 * Shared extraction logic. Used by:
 *   - api/extract.ts          (Vercel serverless, runtime)
 *   - scripts/cacheSample.ts  (build-time, populates public/sample.schema.json)
 *
 * Strategy: Claude does semantics (which fields exist, types, values, grouping,
 * anchor text). pdfjs in the browser does geometry (precise pixel bboxes).
 * That keeps the LLM's job small and reliable.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { FIELD_TYPES, FieldSchemaSchema, type FieldSchema } from '../src/types';

const MODEL = 'claude-opus-4-7';

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    pages: {
      type: 'integer',
      description: 'Total page count of the document.',
    },
    fields: {
      type: 'array',
      description:
        'One entry per form field detected on the document. Include both filled and clearly-empty fields so the user can complete missing required ones.',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'A short stable camelCase identifier unique within the document (e.g. "firstName", "mobileNumber").',
          },
          label: {
            type: 'string',
            description: 'Human-readable label for the field, taken from the printed form.',
          },
          type: {
            type: 'string',
            enum: FIELD_TYPES as unknown as string[],
            description:
              'Best-fit input type. Tick boxes ⇒ checkbox; numeric-only fields like phone or amount ⇒ number; explicit option lists ⇒ select; date fields ⇒ date; long free-text ⇒ textarea; otherwise text.',
          },
          group: {
            type: 'string',
            description:
              'Visible section heading the field belongs to (e.g. "Applicant\'s Name", "Personal Details", "Request Type"). Optional.',
          },
          value: {
            description:
              'The current filled value. Booleans for checkboxes (true if ticked). Empty string or null for blank.',
          },
          required: { type: 'boolean' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'For select fields, the printed options.',
          },
          page: { type: 'integer', minimum: 1 },
          anchorText: {
            type: 'string',
            description:
              'A short printed phrase (1-4 words) visible on the page next to this field that the client can search for to locate it. Use the printed label itself when possible. Must be a phrase that actually appears in the printed text.',
          },
          anchorPlacement: {
            type: 'string',
            enum: ['over', 'right', 'below'],
            description:
              'Where the field sits relative to the anchor text. Use "right" for fields whose value sits to the right of the printed label (most form fields). Use "below" when the value/grid is on the next line. Use "over" only when the anchor *is* the value text itself.',
          },
          bboxHint: {
            type: 'object',
            description:
              'Optional fine-tuning. dx/dy shift the resolved bbox in normalized page units (0..1). widthScale/heightScale resize it.',
            properties: {
              dx: { type: 'number' },
              dy: { type: 'number' },
              widthScale: { type: 'number' },
              heightScale: { type: 'number' },
            },
          },
        },
        required: ['id', 'label', 'type', 'page', 'anchorText', 'anchorPlacement'],
      },
    },
  },
  required: ['pages', 'fields'],
} as const;

const SYSTEM_PROMPT = `You are an expert at reading filled paper forms (especially banking forms) and turning them into structured JSON.

Your task: given a PDF, identify EVERY form field a human would fill in — printed labels with adjacent blanks, tick boxes, signature lines, account-number grids — and return them via the \`extract_form_fields\` tool.

Hard rules:
1. Always call the tool. Do not respond with prose.
2. Include both filled and unfilled fields. Use null/false/"" for blank values.
3. \`anchorText\` MUST be a short printed phrase (1-4 words) that literally appears on the page near the field. Prefer the field's own label, e.g. "Mobile Number", "PAN Number", "Date of Birth". For checkboxes, use the label printed next to the box, e.g. "Internet Banking", "SMS Banking".
4. Set \`anchorPlacement\`:
   - "right" when the user's value sits to the right of the printed label (the common case).
   - "below" when the value is on the next line or in a grid below the label.
   - "over" only when the printed phrase IS itself the user's value (rare).
5. For checkboxes: \`type: "checkbox"\`, \`value: true\` if visibly ticked / filled / crossed, else false. Use the label next to the box as the anchor with placement "right".
6. For grouped tick options that share a question (e.g. "ATM Card required for: Self / Joint / Not Needed"), prefer ONE \`select\` field with options, value = whichever option is ticked — unless the form clearly allows multiple ticks, in which case use one \`checkbox\` per option.
7. \`id\` must be a short camelCase identifier, unique within the document.
8. \`group\` should be the visible section heading.
9. Use plain ISO-style values where reasonable but preserve the user's literal entry when in doubt (dates as written, names exactly as handwritten).
10. Required fields: anything the form marks with * or "mandatory" should set \`required: true\`.`;

export interface ExtractionResult {
  pages: number;
  fields: FieldSchema[];
}

const ToolInputSchema = z.object({
  pages: z.number().int().min(1),
  fields: z.array(FieldSchemaSchema),
});

export async function extractFromPdfBuffer(pdfBuffer: Buffer, apiKey: string): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'extract_form_fields',
        description: 'Return the structured list of form fields detected in the PDF.',
        input_schema: TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_form_fields' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Extract every form field from this document via the tool.',
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block. stop_reason=' + response.stop_reason);
  }

  const parsed = ToolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error('Tool output failed validation: ' + parsed.error.message);
  }
  return parsed.data;
}
