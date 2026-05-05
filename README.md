# PDF Form Extractor

An AI-driven viewer for filled bank-style PDF forms. The left panel renders the PDF; the right panel is a dynamic, validated form generated from a schema that Claude extracted from the document. Focusing a form input highlights the corresponding region on the PDF (and vice versa) — both sides stay in sync through a single Zustand store.

Built with **React + Vite + TypeScript + Tailwind + Zustand + React Hook Form + Zod + Framer Motion + react-pdf**, with extraction handled by **Claude (claude-opus-4-7)** via the Anthropic SDK and tool-use.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Drop your bank-form PDF at:
#      public/sample.pdf

# 3. (Optional) Generate the schema fresh from Claude — uses your API key once
cp .env.example .env.local
# edit .env.local and set ANTHROPIC_API_KEY=...
npm run cache:sample          # writes public/sample.schema.json

# 4. Run
npm run dev                   # http://localhost:5173
```

A hand-curated `public/sample.schema.json` is included for the included PDF, so the demo runs even before you call Claude. Step 3 regenerates it from the actual PDF using the AI.

### Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript type check only |
| `npm run cache:sample` | Run AI extraction on `public/sample.pdf` once, write `public/sample.schema.json` |

---

## How it works

### Build-time AI, runtime cache

> Claude is treated as a **build-time tool, not a runtime tool**.

```
ONE-TIME (developer machine)              EVERY VIEW (production)
────────────────────────────              ──────────────────────────────
npm run cache:sample                      browser → /sample.schema.json
  ↓                                          (static, CDN, ~5ms, 0 tokens)
read public/sample.pdf                       ↓
  ↓                                       react-pdf renders
Claude Opus 4.7 (PDF input + tool-use)    pdfjs resolves bboxes from anchors
  ↓                                          ↓
Zod-validate, write JSON                  form renders, focus syncs
git commit pdf + schema.json
                                          ON UPLOAD (rare)
                                          POST /api/extract → serverless
                                            spends API key, returns schema
```

For the bundled sample, the deployed app serves a static JSON file — no API call per page view, no token cost. Live extraction (`/api/extract`) only fires for PDFs the user uploads through the dropzone.

### Bbox strategy — Claude does semantics, pdfjs does geometry

Asking an LLM for pixel-perfect coordinates is a losing battle. So we don't.

For each field, Claude returns:

```json
{ "id": "mobileNumber", "label": "Mobile Number", "type": "number",
  "value": 6378951260, "page": 1, "anchorText": "Mobile Number",
  "anchorPlacement": "right" }
```

Then in the browser, after `react-pdf` renders, we call `page.getTextContent()`, locate the `anchorText` in the page's text run, and compute the bbox from that text item's transform matrix. Pixel-precise without coordinates ever leaving the deterministic side of the system. `anchorPlacement` (`right` / `below` / `over`) tells us where the *value* sits relative to the *label*, and an optional `bboxHint` lets the schema fine-tune.

See `src/lib/bboxResolver.ts`.

### Tool-use forces structured output

Asking for free-text JSON is unreliable. Instead, the prompt declares an `extract_form_fields` tool whose `input_schema` matches our `FieldSchema[]` exactly, and we set `tool_choice: { type: 'tool', name: 'extract_form_fields' }`. The model has to produce a tool call. We then run the result through Zod (`ExtractedDocSchema`) before trusting it — same code path on server and client. The system prompt is wrapped in `cache_control: { type: 'ephemeral' }` so repeat calls with the same prompt structure pay a much lower cost.

See `api/_extract-core.ts`.

### Six field types

`text · number · checkbox · date · select · textarea` — all rendered from the same JSON schema in `src/components/fields/index.tsx`, all wired through React Hook Form + a Zod schema built dynamically per document by `src/lib/schemaToZod.ts`.

---

## State management

A single Zustand store (`src/store/useFormStore.ts`) is the spine:

```ts
{
  doc: ExtractedDoc | null,         // schema + pdfUrl
  values: Record<string, unknown>,  // initial values from extraction
  focusedFieldId: string | null,    // the focus-sync signal
  isExtracting, extractionError,
}
```

**Why Zustand:** the focus-sync feature requires *both* panels to read and write a shared piece of state (`focusedFieldId`) without prop drilling. Zustand gives us that with selector-based subscriptions, so the PDF panel doesn't re-render on every keystroke in the form (it only subscribes to `focusedFieldId`, while the form subscribes to `values`).

**Why we keep RHF state separate from Zustand**: React Hook Form holds the live form state; we only mirror values into Zustand via `watch()` so the store has a complete picture without making every keystroke trigger a global re-render. Validation and refs stay where RHF can handle them.

---

## File map

```
api/
  _extract-core.ts        Shared Claude call (tool-use + Zod validation)
  extract.ts              Vercel serverless POST handler
public/
  sample.pdf              ← drop your bank PDF here
  sample.schema.json      Cached extraction result (committed)
scripts/
  cacheSample.ts          Build-time: PDF → JSON via Claude
src/
  App.tsx                 Layout shell: header, resizable panes, mobile tabs
  main.tsx                Entry — theme provider + toaster
  types.ts                FieldSchema / ExtractedDoc + Zod schemas (shared)
  store/useFormStore.ts   Zustand store
  lib/
    bboxResolver.ts       pdfjs-based bbox lookup from anchorText
    schemaToZod.ts        Dynamic Zod schema builder (per-field rules)
    pdfWorker.ts          pdfjs worker wiring
    utils.ts              cn() helper
  components/
    PdfViewer.tsx         react-pdf + bbox overlay + zoom
    DynamicForm.tsx       RHF + Zod + grouped sections
    UploadDropzone.tsx    Drag-drop upload → /api/extract
    ThemeToggle.tsx       Light/dark switcher
    fields/index.tsx      Six field-type renderers
```

---

## Validation, polish, accessibility

- **Zod**: per-field rules built dynamically — `email` regex auto-applied to fields with "email" in the label, PAN regex from the schema, mobile number range, max-length on the printed-name field, etc. Required fields show an inline animated error on blur; submit shows a sonner toast on success.
- **Framer Motion**: fade/slide-in for form groups, spring-tweened scale on the focused bbox, dim-and-blur of surrounding overlays when a field is focused, mobile tab transitions.
- **Resizable split** via `react-resizable-panels` — drag the divider to give either panel more room.
- **Responsive**: under `768px` we collapse to tabs (`PDF | Form`). Focusing a field automatically jumps to the PDF tab so you see the highlight.
- **Dark mode** via `next-themes`.
- **A11y**: bbox overlays are `<button>` elements with `aria-label`, full keyboard tab order, visible focus rings, error messages with `role="alert"`.

---

## Real AI extraction on scanned forms (production notes)

The current pipeline assumes the PDF has a real text layer (true for the included bank form — pdfjs can read every printed phrase, which is what makes the `anchorText` trick work). For scanned-only PDFs the same architecture still applies, with one extra step at the front:

1. **Detect the text layer.** If `pdf.getPage(n).getTextContent()` returns nothing, the PDF is image-only.
2. **OCR the document.** Best accuracy: AWS Textract `AnalyzeDocument` with `FORMS` and `TABLES`, Google Document AI's form parser, or Azure Document Intelligence. These return text *plus precise bounding boxes per word, key-value pair, and checkbox state* — the geometry problem is solved at this layer.
3. **Use Claude for semantics.** Pass the structured KV pairs from step 2 to Claude (no PDF this time) and ask it to: normalize labels, infer field types, group into sections, and apply validation hints. This plays to Claude's strength (semantic reasoning) while leaving coordinates to the deterministic OCR service.
4. **Confidence routing.** Propagate per-field confidence from Textract through to the schema. Below ~0.8 → flag for human review; below ~0.5 → don't auto-fill at all.
5. **Cache by PDF hash.** Same PDF → same extraction. Hash the PDF bytes, key the cache by hash, and short-circuit before paying for either OCR or Claude on a re-upload.

For *handwritten* values specifically, Textract Forms is currently more accurate than vanilla Claude vision. Claude shines when the form structure is unusual or the field labels are domain-specific (medical, legal) where naive OCR misses context.

---

## Deploy to Vercel

```bash
vercel deploy            # preview
vercel deploy --prod     # production
```

Set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables (only used by `/api/extract` on uploads). The bundled sample never calls the API.

---

## Trade-offs / future work

- The bundled `sample.schema.json` is hand-curated for the included PDF; running `npm run cache:sample` regenerates it from Claude. Both code paths share the same Zod-validated extraction core.
- For multi-page forms, anchor lookup runs in parallel per page (`Promise.all` in `resolveAllBBoxes`).
- Signature and photo regions could be added as a `signature` field type with a different overlay style.
- Confidence scoring + human-in-the-loop UI for low-confidence fields would be the natural next step for a real product.
