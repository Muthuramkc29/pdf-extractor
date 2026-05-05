import { useCallback, useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useFormStore } from '@/store/useFormStore';
import { ExtractedDocSchema } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  onLoaded: (pdfUrl: string) => void;
}

export function UploadDropzone({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const setExtracting = useFormStore((s) => s.setExtracting);
  const setExtractionError = useFormStore((s) => s.setExtractionError);
  const loadDoc = useFormStore((s) => s.loadDoc);
  const isExtracting = useFormStore((s) => s.isExtracting);

  const handle = useCallback(
    async (file: File) => {
      if (!file.type.includes('pdf')) {
        toast.error('Please drop a PDF file.');
        return;
      }
      setExtracting(true);
      setExtractionError(null);
      const blobUrl = URL.createObjectURL(file);
      const t0 = Date.now();
      try {
        const arrayBuf = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuf).reduce((acc, b) => acc + String.fromCharCode(b), ''),
        );
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ base64 }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server returned ${res.status}`);
        }
        const json = await res.json();
        const parsed = ExtractedDocSchema.safeParse({
          pdfUrl: blobUrl,
          pages: json.pages,
          fields: json.fields,
        });
        if (!parsed.success) {
          throw new Error('Schema returned by server failed validation: ' + parsed.error.message);
        }
        loadDoc(parsed.data);
        onLoaded(blobUrl);
        toast.success(
          `Extracted ${parsed.data.fields.length} fields in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed';
        setExtractionError(msg);
        toast.error('Extraction failed', { description: msg });
      } finally {
        setExtracting(false);
      }
    },
    [loadDoc, onLoaded, setExtracting, setExtractionError],
  );

  return (
    <motion.label
      htmlFor="pdf-upload"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handle(file);
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs transition',
        dragOver ? 'border-highlight bg-highlight/10 text-foreground' : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
        isExtracting && 'pointer-events-none opacity-60',
      )}
      whileTap={{ scale: 0.98 }}
    >
      {isExtracting ? (
        <>
          <FileText className="h-3.5 w-3.5 animate-pulse" />
          <span>Extracting…</span>
        </>
      ) : (
        <>
          <Upload className="h-3.5 w-3.5" />
          <span>Drop or click to upload PDF</span>
        </>
      )}
      <input
        ref={inputRef}
        id="pdf-upload"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handle(file);
          e.target.value = '';
        }}
      />
    </motion.label>
  );
}
