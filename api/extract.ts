/**
 * Vercel serverless function. POST a PDF (multipart/form-data with field "file"
 * OR JSON { base64: string }) and get back { pages, fields } extracted by Claude.
 *
 * The frontend only hits this on uploaded PDFs — the bundled sample.pdf already
 * has its schema cached at /sample.schema.json, so the deployed demo doesn't
 * spend tokens per page view.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractFromPdfBuffer } from './_extract-core';

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
    return;
  }

  try {
    let pdfBuffer: Buffer;
    const contentType = req.headers['content-type'] ?? '';

    if (contentType.includes('application/json')) {
      const { base64 } = req.body as { base64?: string };
      if (!base64) {
        res.status(400).json({ error: 'Missing base64 field' });
        return;
      }
      pdfBuffer = Buffer.from(base64, 'base64');
    } else {
      // Vercel parses raw bodies for non-JSON when bodyParser is enabled; we accept
      // application/pdf directly as a convenience.
      const raw = req.body;
      if (Buffer.isBuffer(raw)) {
        pdfBuffer = raw;
      } else if (typeof raw === 'string') {
        pdfBuffer = Buffer.from(raw, 'binary');
      } else {
        res.status(415).json({
          error:
            'Unsupported content-type. POST application/json {base64} or application/pdf raw body.',
        });
        return;
      }
    }

    if (pdfBuffer.length < 100) {
      res.status(400).json({ error: 'PDF buffer too small / invalid' });
      return;
    }

    const result = await extractFromPdfBuffer(pdfBuffer, apiKey);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/extract] failed:', message);
    res.status(500).json({ error: message });
  }
}
