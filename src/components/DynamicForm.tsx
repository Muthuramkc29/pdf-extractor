import { useEffect, useMemo, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useFormStore } from '@/store/useFormStore';
import { buildZodSchema } from '@/lib/schemaToZod';
import {
  CheckboxField,
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from './fields';
import type { FieldSchema } from '@/types';

export function DynamicForm() {
  const doc = useFormStore((s) => s.doc);
  const values = useFormStore((s) => s.values);
  const focusedFieldId = useFormStore((s) => s.focusedFieldId);
  const setFocused = useFormStore((s) => s.setFocused);
  const setValue = useFormStore((s) => s.setValue);

  const fields = doc?.fields ?? [];
  const zodSchema = useMemo(() => buildZodSchema(fields), [fields]);

  const {
    register,
    handleSubmit,
    setFocus,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(zodSchema) as Resolver,
    defaultValues: values,
    mode: 'onBlur',
  });

  // Reset RHF when a new doc is loaded.
  useEffect(() => {
    reset(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.pdfUrl]);

  // Mirror RHF values back into Zustand for any consumers that need live values.
  useEffect(() => {
    const sub = watch((v, { name }) => {
      if (name) setValue(name, v[name]);
    });
    return () => sub.unsubscribe();
  }, [watch, setValue]);

  // Sync focus from PDF clicks into the form input (bidirectional focus).
  const lastSyncedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedFieldId || lastSyncedFocus.current === focusedFieldId) return;
    lastSyncedFocus.current = focusedFieldId;
    try {
      setFocus(focusedFieldId);
    } catch {
      /* ignore */
    }
  }, [focusedFieldId, setFocus]);

  const groups = useMemo(() => {
    const map = new Map<string, FieldSchema[]>();
    for (const f of fields) {
      const g = f.group ?? 'Other';
      const arr = map.get(g) ?? [];
      arr.push(f);
      map.set(g, arr);
    }
    return Array.from(map.entries());
  }, [fields]);

  const onSubmit = handleSubmit((data) => {
    toast.success('Form validated', {
      description: `${Object.keys(data).length} fields captured.`,
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
    // In a real app: POST to your backend here.
    // eslint-disable-next-line no-console
    console.log('[form submit]', data);
  });

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Drop a PDF to begin.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full flex-col"
      noValidate
    >
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-2 backdrop-blur">
        <div>
          <h2 className="text-sm font-semibold">Extracted form</h2>
          <p className="text-xs text-muted-foreground">
            Click a field to highlight it on the PDF.
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <Send className="h-3.5 w-3.5" />
          Submit
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence initial={false}>
          {groups.map(([group, gFields]) => (
            <motion.section
              key={group}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mb-5"
            >
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </h3>
              <div className="space-y-1 rounded-lg border bg-card p-2">
                {gFields.map((f) => {
                  const reg = register(f.id, {
                    setValueAs:
                      f.type === 'checkbox'
                        ? (v) => Boolean(v)
                        : f.type === 'number'
                          ? (v) => (v === '' || v === undefined ? '' : v)
                          : undefined,
                  });
                  const err = errors[f.id]?.message as string | undefined;
                  const focused = focusedFieldId === f.id;
                  const common = {
                    field: f,
                    error: err,
                    registerProps: reg,
                    onFocus: () => setFocused(f.id),
                    onBlur: () => setFocused(null),
                    highlighted: focused,
                  };
                  switch (f.type) {
                    case 'checkbox':
                      return <CheckboxField key={f.id} {...common} ref={reg.ref} />;
                    case 'number':
                      return <NumberField key={f.id} {...common} ref={reg.ref} />;
                    case 'date':
                      return <DateField key={f.id} {...common} ref={reg.ref} />;
                    case 'textarea':
                      return <TextareaField key={f.id} {...common} ref={reg.ref} />;
                    case 'select':
                      return <SelectField key={f.id} {...common} ref={reg.ref} />;
                    case 'text':
                    default:
                      return <TextField key={f.id} {...common} ref={reg.ref} />;
                  }
                })}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    </form>
  );
}
