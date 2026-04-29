/**
 * Catalog of system communication events.
 * Events are defined in code (not editable from UI in MVP).
 * Each event documents the recipient types and template variables it supports.
 */

export const COMMUNICATION_EVENTS = {
  INSPECTION_ASSIGNED_INSPECTOR: 'inspection.assigned.inspector',
  INSPECTION_PUBLISHED_OWNER: 'inspection.published.owner',
  INSPECTION_PUBLISHED_TENANT: 'inspection.published.tenant',
} as const;

export type CommunicationEventName =
  (typeof COMMUNICATION_EVENTS)[keyof typeof COMMUNICATION_EVENTS];

export interface CommunicationEventDef {
  name: CommunicationEventName;
  label: string;
  description: string;
  recipientTypes: Array<'inspector' | 'owner' | 'tenant'>;
  variables: string[];
}

export const COMMUNICATION_EVENT_CATALOG: CommunicationEventDef[] = [
  {
    name: COMMUNICATION_EVENTS.INSPECTION_ASSIGNED_INSPECTOR,
    label: 'Inspección asignada al inspector',
    description: 'Se dispara cuando una inspección queda asignada a un inspector.',
    recipientTypes: ['inspector'],
    variables: ['inspector_name', 'property_name', 'address', 'scheduled_at'],
  },
  {
    name: COMMUNICATION_EVENTS.INSPECTION_PUBLISHED_OWNER,
    label: 'Informe publicado para propietario',
    description: 'Se dispara al publicar la versión del informe/cotización para propietario.',
    recipientTypes: ['owner'],
    variables: ['owner_name', 'property_name', 'address', 'public_url'],
  },
  {
    name: COMMUNICATION_EVENTS.INSPECTION_PUBLISHED_TENANT,
    label: 'Informe publicado para inquilino',
    description: 'Se dispara al publicar la versión del informe/cotización para inquilino.',
    recipientTypes: ['tenant'],
    variables: ['tenant_name', 'property_name', 'address', 'public_url'],
  },
];

export const COMMUNICATION_CHANNELS = ['whatsapp', 'email'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_PROVIDERS = [
  { key: 'mock', label: 'Mock (pruebas)', channels: ['whatsapp', 'email'] as CommunicationChannel[] },
  { key: 'darwin', label: 'Darwin (WhatsApp)', channels: ['whatsapp'] as CommunicationChannel[] },
  { key: 'capso', label: 'Capso (WhatsApp)', channels: ['whatsapp'] as CommunicationChannel[] },
  { key: 'resend', label: 'Resend (Email)', channels: ['email'] as CommunicationChannel[] },
  { key: 'sendgrid', label: 'SendGrid (Email)', channels: ['email'] as CommunicationChannel[] },
] as const;

export const RECIPIENT_TYPES = ['inspector', 'owner', 'tenant'] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];
