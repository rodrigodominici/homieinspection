import type { ElementType, ReactNode } from 'react';

interface SensitiveProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

/**
 * Marks rendered text as sensitive for PostHog Session Replay.
 *
 * `maskAllInputs` already covers form fields; this component is for static
 * text that contains PII (tenant names, phones, addresses, signatures, etc.).
 * Use it sparingly — over-masking makes replays useless; under-masking leaks
 * personal data.
 */
export function Sensitive({ children, as: Component = 'span', className }: SensitiveProps) {
  return <Component data-sensitive className={className}>{children}</Component>;
}
