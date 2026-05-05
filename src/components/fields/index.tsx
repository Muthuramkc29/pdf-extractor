import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { FieldSchema } from '@/types';

const inputBase =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'shadow-sm transition placeholder:text-muted-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

interface CommonProps {
  field: FieldSchema;
  error?: string;
}

export interface FieldRendererProps extends CommonProps {
  registerProps: Record<string, unknown>;
  onFocus: () => void;
  onBlur: () => void;
  highlighted?: boolean;
}

const Wrap = ({
  field,
  error,
  highlighted,
  children,
}: {
  field: FieldSchema;
  error?: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      'rounded-md p-2 transition-colors',
      highlighted && 'bg-highlight/5 ring-1 ring-highlight/40',
    )}
  >
    <label htmlFor={field.id} className="mb-1 flex items-baseline gap-1 text-xs font-medium text-foreground/80">
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
    </label>
    {children}
    {error && (
      <p role="alert" className="mt-1 text-xs text-destructive">
        {error}
      </p>
    )}
  </div>
);

export const TextField = forwardRef<HTMLInputElement, FieldRendererProps>(function TextField(
  { field, error, registerProps, onFocus, onBlur, highlighted },
  ref,
) {
  return (
    <Wrap field={field} error={error} highlighted={highlighted}>
      <input
        id={field.id}
        ref={ref}
        type="text"
        className={cn(inputBase, error && 'border-destructive focus:ring-destructive')}
        onFocus={onFocus}
        {...registerProps}
        onBlur={(e) => {
          (registerProps.onBlur as ((e: React.FocusEvent<HTMLInputElement>) => void) | undefined)?.(e);
          onBlur();
        }}
      />
    </Wrap>
  );
});

export const NumberField = forwardRef<HTMLInputElement, FieldRendererProps>(function NumberField(
  { field, error, registerProps, onFocus, onBlur, highlighted },
  ref,
) {
  return (
    <Wrap field={field} error={error} highlighted={highlighted}>
      <input
        id={field.id}
        ref={ref}
        type="text"
        inputMode="numeric"
        className={cn(inputBase, error && 'border-destructive focus:ring-destructive')}
        onFocus={onFocus}
        {...registerProps}
        onBlur={(e) => {
          (registerProps.onBlur as ((e: React.FocusEvent<HTMLInputElement>) => void) | undefined)?.(e);
          onBlur();
        }}
      />
    </Wrap>
  );
});

export const DateField = forwardRef<HTMLInputElement, FieldRendererProps>(function DateField(
  { field, error, registerProps, onFocus, onBlur, highlighted },
  ref,
) {
  return (
    <Wrap field={field} error={error} highlighted={highlighted}>
      <input
        id={field.id}
        ref={ref}
        type="text"
        placeholder="dd/mm/yyyy"
        className={cn(inputBase, error && 'border-destructive focus:ring-destructive')}
        onFocus={onFocus}
        {...registerProps}
        onBlur={(e) => {
          (registerProps.onBlur as ((e: React.FocusEvent<HTMLInputElement>) => void) | undefined)?.(e);
          onBlur();
        }}
      />
    </Wrap>
  );
});

export const TextareaField = forwardRef<HTMLTextAreaElement, FieldRendererProps>(
  function TextareaField({ field, error, registerProps, onFocus, onBlur, highlighted }, ref) {
    return (
      <Wrap field={field} error={error} highlighted={highlighted}>
        <textarea
          id={field.id}
          ref={ref}
          rows={3}
          className={cn(inputBase, 'resize-y', error && 'border-destructive focus:ring-destructive')}
          onFocus={onFocus}
          {...registerProps}
          onBlur={(e) => {
            (registerProps.onBlur as ((e: React.FocusEvent<HTMLTextAreaElement>) => void) | undefined)?.(e);
            onBlur();
          }}
        />
      </Wrap>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, FieldRendererProps>(function SelectField(
  { field, error, registerProps, onFocus, onBlur, highlighted },
  ref,
) {
  const opts = field.options ?? [];
  return (
    <Wrap field={field} error={error} highlighted={highlighted}>
      <select
        id={field.id}
        ref={ref}
        className={cn(inputBase, 'appearance-none pr-8', error && 'border-destructive focus:ring-destructive')}
        onFocus={onFocus}
        {...registerProps}
        onBlur={(e) => {
          (registerProps.onBlur as ((e: React.FocusEvent<HTMLSelectElement>) => void) | undefined)?.(e);
          onBlur();
        }}
      >
        <option value="">— Select —</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Wrap>
  );
});

export const CheckboxField = forwardRef<HTMLInputElement, FieldRendererProps>(function CheckboxField(
  { field, error, registerProps, onFocus, onBlur, highlighted },
  ref,
) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md p-2 transition-colors',
        highlighted && 'bg-highlight/5 ring-1 ring-highlight/40',
      )}
    >
      <input
        id={field.id}
        ref={ref}
        type="checkbox"
        className={cn(
          'mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring',
          error && 'border-destructive',
        )}
        onFocus={onFocus}
        {...registerProps}
        onBlur={(e) => {
          (registerProps.onBlur as ((e: React.FocusEvent<HTMLInputElement>) => void) | undefined)?.(e);
          onBlur();
        }}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={field.id} className="block text-xs font-medium text-foreground/80">
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </label>
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
});
