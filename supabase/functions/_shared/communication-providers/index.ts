/**
 * Provider adapter contract for the Communications module.
 * Each adapter takes a normalized send payload and returns a result that the
 * dispatcher persists in `communication_deliveries`.
 */

export interface ProviderSendInput {
  channel: 'whatsapp' | 'email' | string;
  recipient: string;
  templateKey: string;
  externalTemplateName: string | null;
  language: string | null;
  variables: Record<string, string>;
  previewText: string | null;
}

export interface ProviderSendResult {
  status: 'sent' | 'error' | 'skipped';
  providerMessageId?: string | null;
  errorMessage?: string | null;
  raw?: unknown;
}

export interface Provider {
  key: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

import { mockProvider } from './mock.ts';
import { darwinWhatsappProvider } from './whatsapp-darwin.ts';
import { resendEmailProvider } from './email-resend.ts';

const REGISTRY: Record<string, Provider> = {
  mock: mockProvider,
  darwin: darwinWhatsappProvider,
  resend: resendEmailProvider,
};

export function getProvider(key: string): Provider {
  return REGISTRY[key] ?? mockProvider;
}
