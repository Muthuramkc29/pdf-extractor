import { create } from 'zustand';
import type { ExtractedDoc } from '@/types';

interface FormStore {
  doc: ExtractedDoc | null;
  values: Record<string, unknown>;
  focusedFieldId: string | null;
  isExtracting: boolean;
  extractionError: string | null;

  loadDoc: (doc: ExtractedDoc) => void;
  setValue: (id: string, v: unknown) => void;
  setFocused: (id: string | null) => void;
  setExtracting: (v: boolean) => void;
  setExtractionError: (msg: string | null) => void;
  reset: () => void;
}

const initialValuesFor = (doc: ExtractedDoc): Record<string, unknown> => {
  const acc: Record<string, unknown> = {};
  for (const f of doc.fields) {
    if (f.type === 'checkbox') acc[f.id] = Boolean(f.value);
    else if (f.type === 'number') acc[f.id] = f.value === null || f.value === undefined ? '' : Number(f.value);
    else acc[f.id] = f.value ?? '';
  }
  return acc;
};

export const useFormStore = create<FormStore>((set) => ({
  doc: null,
  values: {},
  focusedFieldId: null,
  isExtracting: false,
  extractionError: null,

  loadDoc: (doc) => set({ doc, values: initialValuesFor(doc), focusedFieldId: null, extractionError: null }),
  setValue: (id, v) => set((s) => ({ values: { ...s.values, [id]: v } })),
  setFocused: (id) => set({ focusedFieldId: id }),
  setExtracting: (v) => set({ isExtracting: v }),
  setExtractionError: (msg) => set({ extractionError: msg }),
  reset: () => set({ doc: null, values: {}, focusedFieldId: null, extractionError: null }),
}));
