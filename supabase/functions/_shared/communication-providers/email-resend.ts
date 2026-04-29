import type { Provider, ProviderSendResult } from './index.ts';

export const resendEmailProvider: Provider = {
  key: 'resend',
  async send(): Promise<ProviderSendResult> {
    return {
      status: 'error',
      errorMessage: 'resend_provider_not_configured',
    };
  },
};
