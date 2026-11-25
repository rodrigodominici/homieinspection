import { assertEquals } from 'jsr:@std/assert';
import { resolveCustomerSuccessSource } from './resolve.ts';
Deno.test('MX uses Finalizaciones ticket owner', () => assertEquals(resolveCustomerSuccessSource('MX'), { kind: 'ticket_owner', pipelineLabel: 'Finalizaciones' }));
Deno.test('CL uses contract Customer Success property', () => assertEquals(resolveCustomerSuccessSource('CL'), { kind: 'contract_property', label: 'Ejecutiva(o) Customer Success' }));
