import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Allow decimals. Default true. */
  decimal?: boolean;
}

/**
 * Numeric input without the native browser spinner arrows / wheel scroll.
 * Uses `type="text"` + `inputMode="decimal"` to keep the mobile numeric keypad
 * but eliminate desktop arrow buttons and accidental wheel increments.
 * Accepts comma or dot as decimal separator.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, decimal = true, className, onBlur, ...rest }, ref) => {
    const [local, setLocal] = React.useState<string>(value == null ? '' : String(value));
    const focused = React.useRef(false);

    // Sync external value when not actively editing.
    React.useEffect(() => {
      if (!focused.current) {
        setLocal(value == null ? '' : String(value));
      }
    }, [value]);

    const commit = (raw: string) => {
      const cleaned = raw.replace(',', '.').replace(/[^0-9.\-]/g, '');
      const num = parseFloat(cleaned);
      onChange(Number.isFinite(num) ? num : 0);
    };

    return (
      <Input
        ref={ref}
        {...rest}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
        value={local}
        className={cn(className)}
        onFocus={(e) => { focused.current = true; rest.onFocus?.(e); }}
        onChange={(e) => {
          const v = e.target.value;
          // Allow empty, digits, single separator, leading minus
          if (v === '' || /^-?\d*[.,]?\d*$/.test(v)) {
            setLocal(v);
            commit(v);
          }
        }}
        onBlur={(e) => {
          focused.current = false;
          // Normalize display
          const cleaned = local.replace(',', '.');
          const num = parseFloat(cleaned);
          setLocal(Number.isFinite(num) ? String(num) : '');
          onBlur?.(e);
        }}
      />
    );
  },
);
NumberInput.displayName = 'NumberInput';
