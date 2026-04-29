import type { Provider, ProviderSendInput, ProviderSendResult } from './index.ts';

export const mockProvider: Provider = {
  key: 'mock',
  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    console.log('[mock-provider] send', JSON.stringify(input));
    return {
      status: 'sent',
      providerMessageId: `mock_${crypto.randomUUID()}`,
      raw: { provider: 'mock', echoed: input },
    };
  },
};
