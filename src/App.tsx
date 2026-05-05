import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FormInput, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PdfViewer } from '@/components/PdfViewer';
import { DynamicForm } from '@/components/DynamicForm';
import { UploadDropzone } from '@/components/UploadDropzone';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useFormStore } from '@/store/useFormStore';
import { ExtractedDocSchema } from '@/types';
import { cn } from '@/lib/utils';
import '@/lib/pdfWorker';

const SAMPLE_PDF_URL = '/sample.pdf';
const SAMPLE_SCHEMA_URL = '/sample.schema.json';

type MobileTab = 'pdf' | 'form';

export default function App() {
  const [pdfUrl, setPdfUrl] = useState<string>(SAMPLE_PDF_URL);
  const [mobileTab, setMobileTab] = useState<MobileTab>('pdf');
  const loadDoc = useFormStore((s) => s.loadDoc);
  const isExtracting = useFormStore((s) => s.isExtracting);
  const focusedFieldId = useFormStore((s) => s.focusedFieldId);

  // On mount, fetch the cached schema for the bundled sample PDF. No API call.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SAMPLE_SCHEMA_URL);
        if (!res.ok) throw new Error(`sample.schema.json missing (${res.status})`);
        const json = await res.json();
        const parsed = ExtractedDocSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error('Cached schema invalid: ' + parsed.error.message);
        }
        if (!cancelled) loadDoc(parsed.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error('Could not load sample schema', { description: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDoc]);

  // When a field is focused on small screens, jump to the PDF tab so the user can see the highlight.
  useEffect(() => {
    if (focusedFieldId && window.matchMedia('(max-width: 767px)').matches) {
      setMobileTab('pdf');
    }
  }, [focusedFieldId]);

  const isMobile = useIsMobile();

  return (
    <div className="flex h-full flex-col">
      <Header pdfUrl={pdfUrl} setPdfUrl={setPdfUrl} />

      {isExtracting && <ExtractingBanner />}

      {isMobile ? (
        <MobileLayout pdfUrl={pdfUrl} tab={mobileTab} setTab={setMobileTab} />
      ) : (
        <DesktopLayout pdfUrl={pdfUrl} />
      )}
    </div>
  );
}

function Header({ pdfUrl, setPdfUrl }: { pdfUrl: string; setPdfUrl: (u: string) => void }) {
  const isSample = pdfUrl === SAMPLE_PDF_URL;
  return (
    <header className="flex items-center justify-between border-b bg-card/80 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-highlight/15 text-highlight">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">PDF Form Extractor</h1>
          <p className="text-[11px] text-muted-foreground">
            {isSample ? 'Sample schema cached at build-time' : 'Live extraction via /api/extract'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <UploadDropzone onLoaded={setPdfUrl} />
        <ThemeToggle />
      </div>
    </header>
  );
}

function ExtractingBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b bg-highlight/10 px-4 py-1.5 text-center text-xs text-foreground/80"
    >
      Reading your PDF with Claude — this usually takes 10–30 seconds.
    </motion.div>
  );
}

function DesktopLayout({ pdfUrl }: { pdfUrl: string }) {
  return (
    <PanelGroup direction="horizontal" className="flex-1">
      <Panel defaultSize={58} minSize={30} className="border-r">
        <PdfViewer pdfUrl={pdfUrl} />
      </Panel>
      <PanelResizeHandle className="group relative w-1 bg-border transition hover:bg-highlight/40">
        <div className="absolute inset-y-0 -left-1 w-3 group-hover:bg-highlight/10" />
      </PanelResizeHandle>
      <Panel defaultSize={42} minSize={28}>
        <DynamicForm />
      </Panel>
    </PanelGroup>
  );
}

function MobileLayout({
  pdfUrl,
  tab,
  setTab,
}: {
  pdfUrl: string;
  tab: MobileTab;
  setTab: (t: MobileTab) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex border-b bg-card">
        <TabBtn active={tab === 'pdf'} onClick={() => setTab('pdf')} icon={<FileText className="h-3.5 w-3.5" />}>
          PDF
        </TabBtn>
        <TabBtn active={tab === 'form'} onClick={() => setTab('form')} icon={<FormInput className="h-3.5 w-3.5" />}>
          Form
        </TabBtn>
      </div>
      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === 'pdf' ? -8 : 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === 'pdf' ? 8 : -8 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
          >
            {tab === 'pdf' ? <PdfViewer pdfUrl={pdfUrl} /> : <DynamicForm />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition',
        active
          ? 'border-highlight text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function useIsMobile() {
  const mql = useMemo(() => window.matchMedia('(max-width: 767px)'), []);
  const [is, setIs] = useState(mql.matches);
  useEffect(() => {
    const cb = (e: MediaQueryListEvent) => setIs(e.matches);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  }, [mql]);
  return is;
}
