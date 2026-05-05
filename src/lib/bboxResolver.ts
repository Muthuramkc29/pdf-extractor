import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { FieldSchema } from '@/types';

export interface ResolvedBBox {
  page: number;
  // All values are normalized 0..1 of the page's PDF userspace dimensions
  // with the top-left origin (matches CSS coordinate convention after we
  // flip y from PDF's bottom-left origin).
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Aggressive normalization for anchor lookup. pdfjs often splits text on
 * whitespace, apostrophes, and asterisks (so "*CIF ID" can come back as
 * three separate items), so we strip everything that isn't a letter, digit,
 * or single space.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Walks a page's text content, sliding a window over consecutive text items
 * and returning the first window whose joined text contains the anchor.
 */
async function findAnchorOnPage(
  pdf: PDFDocumentProxy,
  pageNum: number,
  anchor: string,
  skipMatches = 0,
) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const text = await page.getTextContent();
  const items = text.items as TextItem[];
  const target = norm(anchor);
  if (!target) return null;

  let toSkip = skipMatches;
  const WINDOW = 12; // generous so multi-word anchors still match
  for (let i = 0; i < items.length; i++) {
    let combined = '';
    for (let j = i; j < Math.min(i + WINDOW, items.length); j++) {
      const piece = items[j].str ?? '';
      combined += (combined ? ' ' : '') + piece;
      if (norm(combined).includes(target)) {
        if (toSkip > 0) {
          toSkip -= 1;
          // Advance past this match so the next iteration of `i` finds a later one.
          i = j;
          break;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let k = i; k <= j; k++) {
          const it = items[k];
          if (!it.transform) continue;
          const [a, , , d, e, f] = it.transform; // [scaleX, _, _, scaleY, x, y]
          const w = it.width ?? Math.abs(a) * (it.str?.length ?? 1) * 0.5;
          const h = it.height ?? Math.abs(d);
          // pdfjs origin is bottom-left; convert to top-left.
          const x0 = e;
          const y0 = viewport.height - (f + h);
          minX = Math.min(minX, x0);
          minY = Math.min(minY, y0);
          maxX = Math.max(maxX, x0 + w);
          maxY = Math.max(maxY, y0 + h);
        }
        if (!isFinite(minX)) return null;
        return {
          x: minX / viewport.width,
          y: minY / viewport.height,
          width: (maxX - minX) / viewport.width,
          height: (maxY - minY) / viewport.height,
        };
      }
    }
  }
  return null;
}

/**
 * Resolve a single field's bounding box. Returns null if the anchor can't be located.
 */
export async function resolveFieldBBox(pdf: PDFDocumentProxy, field: FieldSchema): Promise<ResolvedBBox | null> {
  // Direct bbox wins. For scanned PDFs (no text layer) this is the only path
  // that works; for text-layer PDFs, callers can still hand-tune by providing
  // a bbox to override anchor-based resolution.
  if (field.bbox) {
    return { page: field.page, ...field.bbox };
  }
  if (!field.anchorText) return null;
  const found = await findAnchorOnPage(pdf, field.page, field.anchorText, field.skipMatches ?? 0);
  if (!found) return null;

  let { x, y, width, height } = found;
  const placement = field.anchorPlacement ?? 'over';

  // Move from the anchor (label) to where the value/checkbox actually sits.
  if (placement === 'right') {
    x = x + width + 0.005; // small gap
    width = Math.max(width * 1.2, 0.08);
  } else if (placement === 'below') {
    y = y + height + 0.002;
    height = Math.max(height * 1.4, 0.025);
  } else {
    // 'over': widen vertically a touch so we encompass the printed value above the line.
    y = Math.max(0, y - height * 0.2);
    height = height * 1.4;
  }

  const hint = field.bboxHint ?? {};
  x += hint.dx ?? 0;
  y += hint.dy ?? 0;
  width *= hint.widthScale ?? 1;
  height *= hint.heightScale ?? 1;

  // Clamp to [0,1].
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  width = Math.max(0.005, Math.min(1 - x, width));
  height = Math.max(0.01, Math.min(1 - y, height));

  return { page: field.page, x, y, width, height };
}

export async function resolveAllBBoxes(pdf: PDFDocumentProxy, fields: FieldSchema[]) {
  const results = new Map<string, ResolvedBBox>();
  const unresolved: { id: string; label: string; anchorText: string | null; page: number }[] = [];
  await Promise.all(
    fields.map(async (f) => {
      const r = await resolveFieldBBox(pdf, f);
      if (r) results.set(f.id, r);
      else unresolved.push({ id: f.id, label: f.label, anchorText: f.anchorText ?? null, page: f.page });
    }),
  );
  if (unresolved.length && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bboxResolver] ${unresolved.length}/${fields.length} fields could not be resolved.`,
      'If most fields fail, the PDF likely has no text layer (scanned/image-only).',
      'In that case, provide a `bbox` directly in the schema instead of an `anchorText`.',
      unresolved,
    );
  }
  return results;
}
