/**
 * One-shot script. Reads public/sample.pdf, calls Claude once, writes
 * public/sample.schema.json. Commit both files. The deployed demo serves the
 * JSON statically so every page view is instant and free.
 *
 *   ANTHROPIC_API_KEY=... npm run cache:sample
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { extractFromPdfBuffer } from '../api/_extract-core';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const ROOT = resolve(import.meta.dirname, '..');
const PDF_PATH = resolve(ROOT, 'public/sample.pdf');
const OUT_PATH = resolve(ROOT, 'public/sample.schema.json');

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY missing. Add it to .env.local or export it.');
    process.exit(1);
  }
  if (!existsSync(PDF_PATH)) {
    console.error(`Missing sample PDF at ${PDF_PATH}.`);
    console.error('Drop your bank form there and re-run.');
    process.exit(1);
  }

  console.log('Reading', PDF_PATH);
  const buf = readFileSync(PDF_PATH);
  console.log(`PDF size: ${(buf.length / 1024).toFixed(1)} KB`);

  console.log('Calling Claude (this may take 10-30s)...');
  const t0 = Date.now();
  const result = await extractFromPdfBuffer(buf, apiKey);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${result.fields.length} fields across ${result.pages} page(s).`);

  const out = {
    pdfUrl: '/sample.pdf',
    pages: result.pages,
    fields: result.fields,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote', OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
