import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useFormStore } from '@/store/useFormStore';
import { resolveAllBBoxes, type ResolvedBBox } from '@/lib/bboxResolver';
import { cn } from '@/lib/utils';

interface Props {
  pdfUrl: string;
}

export function PdfViewer({ pdfUrl }: Props) {
  const doc = useFormStore((s) => s.doc);
  const focusedFieldId = useFormStore((s) => s.focusedFieldId);
  const setFocused = useFormStore((s) => s.setFocused);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pageWidth, setPageWidth] = useState<number>(800);
  const [bboxes, setBboxes] = useState<Map<string, ResolvedBBox>>(new Map());
  const [pdfRef, setPdfRef] = useState<PDFDocumentProxy | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Recompute the rendered page width on container resize so the PDF fits the panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.max(320, entry.contentRect.width - 32);
        setPageWidth(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onDocLoad = useCallback(
    async (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages);
      setPdfRef(pdf);
      if (doc?.fields) {
        const map = await resolveAllBBoxes(pdf, doc.fields);
        setBboxes(map);
      }
    },
    [doc],
  );

  // Re-resolve when the schema changes (after upload).
  useEffect(() => {
    if (pdfRef && doc?.fields) {
      resolveAllBBoxes(pdfRef, doc.fields).then(setBboxes);
    }
  }, [pdfRef, doc]);

  // Scroll the focused bbox into view smoothly.
  useEffect(() => {
    if (!focusedFieldId) return;
    const el = document.getElementById(`bbox-${focusedFieldId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [focusedFieldId]);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, { id: string; bbox: ResolvedBBox; label: string }[]>();
    if (!doc) return map;
    for (const f of doc.fields) {
      const bbox = bboxes.get(f.id);
      if (!bbox) continue;
      const arr = map.get(bbox.page) ?? [];
      arr.push({ id: f.id, bbox, label: f.label });
      map.set(bbox.page, arr);
    }
    return map;
  }, [doc, bboxes]);

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-card/50 px-4 py-2 backdrop-blur">
        <div className="text-sm text-muted-foreground">
          {numPages ? `${numPages} page${numPages > 1 ? 's' : ''}` : 'Loading…'}
          {doc && ` · ${doc.fields.length} fields`}
        </div>
        <div className="flex items-center gap-1">
          <ToolbarBtn onClick={() => setScale((s) => Math.max(0.6, s - 0.1))} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </ToolbarBtn>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarBtn onClick={() => setScale((s) => Math.min(2, s + 0.1))} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setScale(1.2)} aria-label="Reset zoom">
            <Maximize2 className="h-4 w-4" />
          </ToolbarBtn>
        </div>
      </div>

      <div
        ref={containerRef}
        className="scrollbar-thin flex-1 overflow-auto px-4 py-6"
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocLoad}
          loading={<div className="py-20 text-center text-sm text-muted-foreground">Loading PDF…</div>}
          error={<div className="py-20 text-center text-sm text-destructive">Failed to load PDF</div>}
          className="flex flex-col items-center gap-6"
        >
          {numPages !== null &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
                onClick={(e) => {
                  // Dev-only calibration helper: Alt-click anywhere on the PDF
                  // to log normalized coordinates of that point.
                  if (!e.altKey || !import.meta.env.DEV) return;
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = (e.clientX - r.left) / r.width;
                  const y = (e.clientY - r.top) / r.height;
                  // eslint-disable-next-line no-console
                  console.log(`[calibrate] page ${pageNum}: { x: ${x.toFixed(3)}, y: ${y.toFixed(3)} }`);
                }}
                className="relative shadow-lg ring-1 ring-border/60"
              >
                <Page
                  pageNumber={pageNum}
                  width={pageWidth * scale}
                  renderAnnotationLayer={false}
                  renderTextLayer={true}
                />
                <BoundingBoxLayer
                  fields={fieldsByPage.get(pageNum) ?? []}
                  focusedFieldId={focusedFieldId}
                  onSelect={setFocused}
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
}

function ToolbarBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

interface LayerProps {
  fields: { id: string; bbox: ResolvedBBox; label: string }[];
  focusedFieldId: string | null;
  onSelect: (id: string) => void;
}

function BoundingBoxLayer({ fields, focusedFieldId, onSelect }: LayerProps) {
  const hasFocus = focusedFieldId !== null;
  const focusedBox = fields.find((f) => f.id === focusedFieldId)?.bbox;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Spotlight: only the focused bbox stays clear; everything else is gently dimmed.
          We achieve this with a single full-page mask that has a hole punched at the
          focused bbox using radial-gradient — no double-blur, no per-element overlay math. */}
      <AnimatePresence>
        {hasFocus && focusedBox && (
          <motion.div
            key="spotlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 bg-background/45"
            style={{
              WebkitMaskImage: cutoutMask(focusedBox),
              maskImage: cutoutMask(focusedBox),
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
            }}
          />
        )}
      </AnimatePresence>

      {fields.map((f) => {
        const focused = focusedFieldId === f.id;
        const dimmed = hasFocus && !focused;
        return (
          <motion.button
            key={f.id}
            id={`bbox-${f.id}`}
            type="button"
            aria-label={`Highlight: ${f.label}`}
            onClick={() => onSelect(f.id)}
            className={cn(
              'pointer-events-auto absolute rounded-sm outline-none transition-[opacity,box-shadow,background-color,border-color]',
              'cursor-pointer',
              focused
                ? 'z-30 animate-pulse-ring border-2 border-highlight bg-highlight/30 shadow-[0_0_0_4px_hsl(var(--highlight)/0.25),0_8px_24px_-4px_hsl(var(--highlight)/0.5)]'
                : dimmed
                  ? 'z-10 border border-highlight/30 bg-highlight/5 opacity-30'
                  : 'z-10 border border-dashed border-highlight/50 bg-highlight/5 opacity-50 hover:opacity-95',
            )}
            style={{
              left: `${f.bbox.x * 100}%`,
              top: `${f.bbox.y * 100}%`,
              width: `${f.bbox.width * 100}%`,
              height: `${f.bbox.height * 100}%`,
            }}
            initial={false}
            animate={{ scale: focused ? 1.04 : 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          />
        );
      })}
    </div>
  );
}

/**
 * Build a CSS mask that is fully opaque (dim is shown) everywhere EXCEPT a
 * rectangular hole at the focused bbox (dim is invisible there). A small
 * feather around the hole edge softens the transition.
 */
function cutoutMask(bbox: { x: number; y: number; width: number; height: number }): string {
  const pad = 0.4; // % of page, expands the hole a touch around the bbox
  const x0 = Math.max(0, bbox.x * 100 - pad);
  const y0 = Math.max(0, bbox.y * 100 - pad);
  const x1 = Math.min(100, (bbox.x + bbox.width) * 100 + pad);
  const y1 = Math.min(100, (bbox.y + bbox.height) * 100 + pad);
  // Two horizontal bands above/below the bbox + two vertical bands left/right of the bbox.
  // Each band is a fully-opaque linear-gradient; combined they cover the page minus the hole.
  return [
    `linear-gradient(#000,#000) 0 0/100% ${y0}% no-repeat`,
    `linear-gradient(#000,#000) 0 100%/100% ${100 - y1}% no-repeat`,
    `linear-gradient(#000,#000) 0 ${y0}%/${x0}% ${y1 - y0}% no-repeat`,
    `linear-gradient(#000,#000) 100% ${y0}%/${100 - x1}% ${y1 - y0}% no-repeat`,
  ].join(', ');
}
