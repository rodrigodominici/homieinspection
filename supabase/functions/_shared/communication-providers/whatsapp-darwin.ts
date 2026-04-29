import type { Provider, ProviderSendResult } from './index.ts';

export const darwinWhatsappProvider: Provider = {
  key: 'darwin',
  async send(): Promise<ProviderSendResult> {
    return {
      status: 'error',
      errorMessage: 'darwin_provider_not_configured',
    };
  },
};
