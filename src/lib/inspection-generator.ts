/**
 * Dynamic inspection section generation.
 *
 * ROLLOUT (R8): This 7-step grouped model applies to newly generated inspections only.
 * Existing inspections retain their original `generated_structure_json` and section records.
 * The UI renders whatever sections exist — no forced migration of production data.
 */

import type { PropertyPayload } from '@/lib/types';

export interface GeneratedSection {
  section_key: string;
  section_title: string;
  section_type: string;
  sort_order: number;
  fields: GeneratedField[];
}

export interface GeneratedField {
  field_key: string;
  field_label: string;
  field_type: string;
  group_key: string;
  sort_order: number;
  required: boolean;
  options_json?: unknown;
}

// ─── R1: Legacy payload field mapping ───────────────────────────────────────
function normalizeIncomingPayload(raw: PropertyPayload): PropertyPayload {
  return {
    ...raw,
    recipient_email: raw.recipient_email ?? (raw as any).correo_receptora ?? null,
    tenant_name: raw.tenant_name ?? (raw as any).nombre_inquilino ?? null,
    tenant_whatsapp: raw.tenant_whatsapp ?? (raw as any).whatsapp_inquilino ?? null,
    unit_number: raw.unit_number ?? (raw as any).numero_depto ?? null,
    fecha_inspeccion: raw.fecha_inspeccion ?? (raw as any).inspection_date ?? null,
    parking_number: raw.parking_number ?? (raw as any).numero_estacionamiento ?? null,
    storage_number: raw.storage_number ?? (raw as any).numero_bodega ?? null,
    fecha_de_termino_real_de_contrato: raw.fecha_de_termino_real_de_contrato ?? (raw as any).contract_end_date ?? null,
    fecha_de_recepcion_del_checkout_cl: raw.fecha_de_recepcion_del_checkout_cl ?? (raw as any).checkout_received_date ?? null,
  };
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'bueno', label: 'Bueno' },
  { value: 'regular', label: 'Regular' },
  { value: 'malo', label: 'Malo' },
  { value: 'no_aplica', label: 'No Aplica' },
];

function makeStatusField(key: string, label: string, sortOrder: number, groupKey = 'status'): GeneratedField {
  return {
    field_key: key,
    field_label: label,
    field_type: 'single_select',
    group_key: groupKey,
    sort_order: sortOrder,
    required: true,
    options_json: STATUS_OPTIONS,
  };
}

function makeSpaceFields(sectionKey: string): GeneratedField[] {
  return [
    makeStatusField(`${sectionKey}_status`, 'Estado General', 0),
    {
      field_key: `${sectionKey}_observation`,
      field_label: 'Observaciones',
      field_type: 'textarea',
      group_key: 'observation',
      sort_order: 1,
      required: false,
    },
    {
      field_key: `${sectionKey}_photos`,
      field_label: 'Fotos',
      field_type: 'photo_upload',
      group_key: 'photo',
      sort_order: 2,
      required: false,
    },
  ];
}

// ─── 7-Step Generation ──────────────────────────────────────────────────────

function isStudio(payload: PropertyPayload): boolean {
  if (payload.bedrooms_count === 0) return true;
  if (payload.typology?.toLowerCase() === 'estudio') return true;
  return false;
}

export function generateSections(rawPayload: PropertyPayload): GeneratedSection[] {
  const payload = normalizeIncomingPayload(rawPayload);
  const sections: GeneratedSection[] = [];
  let order = 0;
  const studio = isStudio(payload);

  // ── Step 1: Datos del Inmueble / Recepción (reception_meta) ──────────────
  const receptionFields: GeneratedField[] = [
    // Context fields (R5: group_key 'context' → muted read-only)
    { field_key: 'ctx_market', field_label: 'Mercado', field_type: 'text', group_key: 'context', sort_order: 0, required: false },
    { field_key: 'ctx_property_id', field_label: 'ID Inmueble', field_type: 'text', group_key: 'context', sort_order: 1, required: false },
    { field_key: 'ctx_address', field_label: 'Dirección Inmueble', field_type: 'text', group_key: 'context', sort_order: 2, required: false },
    { field_key: 'ctx_unit_number', field_label: 'Nº Dpto/Casa', field_type: 'text', group_key: 'context', sort_order: 3, required: false },
    { field_key: 'ctx_tower', field_label: 'Torre', field_type: 'text', group_key: 'context', sort_order: 4, required: false },
    { field_key: 'ctx_parking', field_label: 'Estacionamiento', field_type: 'text', group_key: 'context', sort_order: 5, required: false },
    { field_key: 'ctx_storage', field_label: 'Bodega', field_type: 'text', group_key: 'context', sort_order: 6, required: false },
    { field_key: 'ctx_fecha_inspeccion', field_label: 'Fecha de Inspección', field_type: 'date', group_key: 'context', sort_order: 7, required: false },
    { field_key: 'ctx_recipient_email', field_label: 'Correo Receptora/o', field_type: 'email', group_key: 'context', sort_order: 8, required: false },
    { field_key: 'ctx_inspection_type', field_label: 'Tipo de Recepción', field_type: 'text', group_key: 'context', sort_order: 9, required: false },
    { field_key: 'ctx_property_type', field_label: 'Tipo de Propiedad', field_type: 'text', group_key: 'context', sort_order: 10, required: false },
    { field_key: 'ctx_bedrooms', field_label: 'Dormitorios', field_type: 'number', group_key: 'context', sort_order: 11, required: false },
    { field_key: 'ctx_bathrooms', field_label: 'Baños', field_type: 'number', group_key: 'context', sort_order: 12, required: false },
  ];

  // Tenant contact context (R4)
  if (payload.tenant_name || payload.tenant_whatsapp) {
    receptionFields.push(
      { field_key: 'ctx_tenant_name', field_label: 'Nombre del Inquilino', field_type: 'text', group_key: 'context_tenant', sort_order: 13, required: false },
    );
    if (payload.tenant_whatsapp) {
      receptionFields.push(
        { field_key: 'ctx_tenant_whatsapp', field_label: 'WhatsApp del Inquilino', field_type: 'phone', group_key: 'context_tenant', sort_order: 14, required: false },
      );
    }
  }

  if (payload.warranty_deposit) {
    receptionFields.push(
      { field_key: 'ctx_warranty_deposit', field_label: 'Depósito en Garantía', field_type: 'number', group_key: 'context', sort_order: 15, required: false },
    );
  }

  // Inspector-entered fields (R5: group_key 'inspector_input')
  receptionFields.push(
    { field_key: 'keys_observation', field_label: 'Observaciones Llaves / Tarjetas', field_type: 'textarea', group_key: 'inspector_input', sort_order: 20, required: false },
    { field_key: 'keys_photos', field_label: 'Fotos Llaves / Tarjetas', field_type: 'photo_upload', group_key: 'inspector_input', sort_order: 21, required: false },
    { field_key: 'property_facade_photos', field_label: 'Fotos Fachada', field_type: 'photo_upload', group_key: 'inspector_input', sort_order: 22, required: false },
  );

  sections.push({
    section_key: 'reception_data',
    section_title: 'Datos del Inmueble / Recepción',
    section_type: 'reception_meta',
    sort_order: order++,
    fields: receptionFields,
  });

  // ── Step 2: Persona que Entrega (handover_meta) ──────────────────────────
  sections.push({
    section_key: 'handover_person',
    section_title: 'Persona que Entrega',
    section_type: 'handover_meta',
    sort_order: order++,
    fields: [
      { field_key: 'handover_tenant_name', field_label: 'Nombre y Apellido del Inquilino', field_type: 'text', group_key: 'info', sort_order: 0, required: false },
      { field_key: 'handover_name', field_label: 'Nombre y Apellido de Quien Entrega', field_type: 'text', group_key: 'info', sort_order: 1, required: true },
      { field_key: 'handover_email', field_label: 'Email de Quien Entrega', field_type: 'email', group_key: 'info', sort_order: 2, required: false },
      { field_key: 'handover_phone', field_label: 'Teléfono de Quien Entrega', field_type: 'phone', group_key: 'info', sort_order: 3, required: false },
    ],
  });

  // ── Step 3: Acceso (space_standard) ──────────────────────────────────────
  sections.push({
    section_key: 'access',
    section_title: 'Acceso',
    section_type: 'space_standard',
    sort_order: order++,
    fields: makeSpaceFields('access'),
  });

  // ── Step 4: Living / Bedrooms ────────────────────────────────────────────
  if (studio) {
    sections.push({
      section_key: 'living_dormitorio',
      section_title: 'Living / Dormitorio (Estudio)',
      section_type: 'space_standard',
      sort_order: order++,
      fields: makeSpaceFields('living_dormitorio'),
    });
  } else {
    sections.push({
      section_key: 'living',
      section_title: 'Living / Comedor',
      section_type: 'space_standard',
      sort_order: order++,
      fields: makeSpaceFields('living'),
    });

    const bedroomCount = payload.bedrooms_count ?? 0;
    for (let i = 1; i <= bedroomCount; i++) {
      sections.push({
        section_key: `bedroom_${i}`,
        section_title: `Dormitorio ${i}`,
        section_type: 'space_standard',
        sort_order: order++,
        fields: makeSpaceFields(`bedroom_${i}`),
      });
    }
  }

  // Secondary spaces (after living/bedrooms)
  if (payload.has_terrace_living) {
    sections.push({ section_key: 'terrace_living', section_title: 'Terraza Living', section_type: 'space_secondary', sort_order: order++, fields: makeSpaceFields('terrace_living') });
  }
  if (payload.has_terrace_bedroom) {
    sections.push({ section_key: 'terrace_bedroom', section_title: 'Terraza Dormitorio', section_type: 'space_secondary', sort_order: order++, fields: makeSpaceFields('terrace_bedroom') });
  }
  if (payload.has_walking_closet) {
    sections.push({ section_key: 'walking_closet', section_title: 'Walking Closet', section_type: 'space_secondary', sort_order: order++, fields: makeSpaceFields('walking_closet') });
  }

  // R2: Storage & Parking — explicit sub-blocks
  if (payload.has_storage || payload.has_parking) {
    const spFields: GeneratedField[] = [];
    let sortIdx = 0;
    if (payload.has_parking) {
      spFields.push(
        makeStatusField('parking_status', 'Estado Estacionamiento', sortIdx++, 'parking'),
        { field_key: 'parking_observation', field_label: 'Observaciones Estacionamiento', field_type: 'textarea', group_key: 'parking', sort_order: sortIdx++, required: false },
        { field_key: 'parking_photos', field_label: 'Fotos Estacionamiento', field_type: 'photo_upload', group_key: 'parking', sort_order: sortIdx++, required: false },
      );
    }
    if (payload.has_storage) {
      spFields.push(
        makeStatusField('storage_status', 'Estado Bodega', sortIdx++, 'storage'),
        { field_key: 'storage_observation', field_label: 'Observaciones Bodega', field_type: 'textarea', group_key: 'storage', sort_order: sortIdx++, required: false },
        { field_key: 'storage_photos', field_label: 'Fotos Bodega', field_type: 'photo_upload', group_key: 'storage', sort_order: sortIdx++, required: false },
      );
    }
    sections.push({
      section_key: 'storage_and_parking',
      section_title: payload.has_parking && payload.has_storage ? 'Bodega y Estacionamiento' : payload.has_parking ? 'Estacionamiento' : 'Bodega',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: spFields,
    });
  }

  if (payload.has_front_yard && payload.property_type?.toLowerCase() === 'casa') {
    sections.push({ section_key: 'front_yard', section_title: 'Antejardín', section_type: 'space_secondary', sort_order: order++, fields: makeSpaceFields('front_yard') });
  }

  // ── Step 5: Cocina y Electrodomésticos (space_kitchen) ───────────────────
  // R6: Kitchen status matrix scope
  const kitchenFields: GeneratedField[] = [
    makeStatusField('kitchen_general_status', 'Estado General Cocina', 0, 'status'),
    makeStatusField('kitchen_countertop_status', 'Estado Mesón', 1, 'status'),
    makeStatusField('kitchen_sink_status', 'Estado Lavaplatos', 2, 'status'),
    makeStatusField('kitchen_faucet_status', 'Estado Grifería', 3, 'status'),
    // Appliances sub-group
    makeStatusField('appliances_status', 'Estado General Electrodomésticos', 4, 'appliance'),
    // Technical selectors
    {
      field_key: 'encimera_type', field_label: 'Tipo de Encimera', field_type: 'single_select', group_key: 'technical', sort_order: 5, required: false,
      options_json: [{ value: 'gas', label: 'Gas' }, { value: 'electrica', label: 'Eléctrica' }, { value: 'induccion', label: 'Inducción' }, { value: 'vitroceramica', label: 'Vitrocerámica' }],
    },
    {
      field_key: 'platos_count', field_label: 'Cantidad de Platos', field_type: 'single_select', group_key: 'technical', sort_order: 6, required: false,
      options_json: [{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: '5', label: '5' }],
    },
    {
      field_key: 'horno_type', field_label: 'Tipo de Horno', field_type: 'single_select', group_key: 'technical', sort_order: 7, required: false,
      options_json: [{ value: 'electrico', label: 'Eléctrico' }, { value: 'gas', label: 'Gas' }, { value: 'sin_horno', label: 'Sin Horno' }],
    },
  ];

  // Conditional logia sub-group
  if (payload.has_logia) {
    kitchenFields.push(
      makeStatusField('logia_status', 'Estado Logia', 10, 'logia'),
      { field_key: 'logia_heater_type', field_label: 'Tipo Calefont', field_type: 'text', group_key: 'logia', sort_order: 11, required: false },
      { field_key: 'logia_heater_maintenance_date', field_label: 'Última Mantención Calefont', field_type: 'date', group_key: 'logia', sort_order: 12, required: false },
      {
        field_key: 'logia_gas_type', field_label: 'Tipo Gas', field_type: 'single_select', group_key: 'logia', sort_order: 13, required: false,
        options_json: [{ value: 'natural', label: 'Gas Natural' }, { value: 'licuado', label: 'Gas Licuado' }, { value: 'none', label: 'Sin Gas' }],
      },
      { field_key: 'logia_observation', field_label: 'Observaciones Logia', field_type: 'textarea', group_key: 'logia', sort_order: 14, required: false },
      { field_key: 'logia_photos', field_label: 'Fotos Logia', field_type: 'photo_upload', group_key: 'logia', sort_order: 15, required: false },
    );
  }

  // Shared observation/photos
  kitchenFields.push(
    { field_key: 'kitchen_observation', field_label: 'Observaciones Cocina / Electrodomésticos', field_type: 'textarea', group_key: 'observation', sort_order: 20, required: false },
    { field_key: 'kitchen_photos', field_label: 'Fotos Cocina / Electrodomésticos', field_type: 'photo_upload', group_key: 'photo', sort_order: 21, required: false },
  );

  sections.push({
    section_key: 'kitchen_appliances',
    section_title: 'Cocina y Electrodomésticos',
    section_type: 'space_kitchen',
    sort_order: order++,
    fields: kitchenFields,
  });

  // ── Step 6: Bathrooms ────────────────────────────────────────────────────
  if (studio) {
    sections.push({
      section_key: 'bathroom_studio',
      section_title: 'Baño (Estudio)',
      section_type: 'space_standard',
      sort_order: order++,
      fields: makeSpaceFields('bathroom_studio'),
    });
  } else {
    const bathroomCount = payload.bathrooms_count ?? 0;
    for (let i = 1; i <= bathroomCount; i++) {
      sections.push({
        section_key: `bathroom_${i}`,
        section_title: `Baño ${i}`,
        section_type: 'space_standard',
        sort_order: order++,
        fields: makeSpaceFields(`bathroom_${i}`),
      });
    }
  }

  // ── Step 7: Cierre y Observaciones Generales (closing_summary) ───────────
  // R3: Key collection fields at top with group_key 'key_collection'
  // R7: Fumigation as single canonical label
  const closingFields: GeneratedField[] = [
    { field_key: 'fecha_recoleccion_llaves', field_label: 'Fecha Recolección de Llaves', field_type: 'date', group_key: 'key_collection', sort_order: 0, required: false },
    { field_key: 'hora_recoleccion_llaves', field_label: 'Hora Recolección de Llaves', field_type: 'text', group_key: 'key_collection', sort_order: 1, required: false },
    {
      field_key: 'cleaning_status', field_label: 'Estado de Aseo', field_type: 'single_select', group_key: 'cleaning', sort_order: 2, required: false,
      options_json: STATUS_OPTIONS,
    },
    { field_key: 'cleaning_observation', field_label: 'Observaciones Aseo', field_type: 'textarea', group_key: 'cleaning', sort_order: 3, required: false },
    {
      field_key: 'removal_status', field_label: 'Retiro de Enseres', field_type: 'single_select', group_key: 'removal', sort_order: 4, required: false,
      options_json: [{ value: 'completo', label: 'Completo' }, { value: 'parcial', label: 'Parcial' }, { value: 'no_realizado', label: 'No Realizado' }],
    },
    { field_key: 'fumigation_observation', field_label: 'Observaciones Fumigación', field_type: 'textarea', group_key: 'fumigation', sort_order: 5, required: false },
    { field_key: 'fumigation_photos', field_label: 'Fotos Fumigación', field_type: 'photo_upload', group_key: 'fumigation', sort_order: 6, required: false },
    // Meter readings
    { field_key: 'meter_electricity', field_label: 'Lectura Electricidad', field_type: 'text', group_key: 'meters', sort_order: 7, required: false },
    { field_key: 'meter_water', field_label: 'Lectura Agua', field_type: 'text', group_key: 'meters', sort_order: 8, required: false },
    { field_key: 'meter_gas', field_label: 'Lectura Gas', field_type: 'text', group_key: 'meters', sort_order: 9, required: false },
    { field_key: 'meter_photos', field_label: 'Fotos Medidores', field_type: 'photo_upload', group_key: 'meters', sort_order: 10, required: false },
    // Admin/building contact
    { field_key: 'admin_name', field_label: 'Nombre Administrador / Mayordomo', field_type: 'text', group_key: 'admin_contact', sort_order: 11, required: false },
    { field_key: 'admin_phone', field_label: 'Teléfono Administrador', field_type: 'phone', group_key: 'admin_contact', sort_order: 12, required: false },
    { field_key: 'admin_email', field_label: 'Correo Administrador', field_type: 'email', group_key: 'admin_contact', sort_order: 13, required: false },
    // General
    { field_key: 'general_observation', field_label: 'Observaciones Generales', field_type: 'textarea', group_key: 'observation', sort_order: 14, required: false },
    { field_key: 'closing_photos', field_label: 'Fotos Adicionales', field_type: 'photo_upload', group_key: 'photo', sort_order: 15, required: false },
  ];

  sections.push({
    section_key: 'closing',
    section_title: 'Cierre y Observaciones Generales',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: closingFields,
  });

  return sections;
}

// ─── Snapshot normalization ─────────────────────────────────────────────────

export function normalizePropertySnapshot(rawPayload: PropertyPayload): Record<string, unknown> {
  const payload = normalizeIncomingPayload(rawPayload);
  return {
    property_id: payload.property_id,
    market: payload.market,
    property_name: payload.property_name,
    address: payload.address,
    typology: payload.typology,
    property_type: payload.property_type,
    inspection_type: payload.inspection_type,
    bedrooms_count: payload.bedrooms_count ?? 0,
    bathrooms_count: payload.bathrooms_count ?? 0,
    has_terrace_living: payload.has_terrace_living ?? false,
    has_terrace_bedroom: payload.has_terrace_bedroom ?? false,
    has_walking_closet: payload.has_walking_closet ?? false,
    has_logia: payload.has_logia ?? false,
    has_storage: payload.has_storage ?? false,
    has_parking: payload.has_parking ?? false,
    has_front_yard: payload.has_front_yard ?? false,
    tower: payload.tower,
    warranty_deposit: payload.warranty_deposit ?? null,
    tenant_name: payload.tenant_name ?? null,
    tenant_whatsapp: payload.tenant_whatsapp ?? null,
    unit_number: payload.unit_number ?? null,
    parking_number: payload.parking_number ?? null,
    storage_number: payload.storage_number ?? null,
    fecha_inspeccion: payload.fecha_inspeccion ?? null,
    recipient_email: payload.recipient_email ?? null,
    scheduled_at: payload.scheduled_at,
    fecha_recoleccion_llaves: payload.fecha_recoleccion_llaves,
    hora_recoleccion_llaves: payload.hora_recoleccion_llaves,
    fecha_de_termino_real_de_contrato: payload.fecha_de_termino_real_de_contrato ?? null,
    fecha_de_recepcion_del_checkout_cl: payload.fecha_de_recepcion_del_checkout_cl ?? null,
  };
}

// ─── Example payloads ───────────────────────────────────────────────────────

export const EXAMPLE_PAYLOADS = {
  studio: {
    hubspot_property_id: "hs_prop_12345",
    property_id: "RE0002496",
    market: "CL",
    property_name: "Chacabuco 1120 1903",
    address: "Matucana 1161 Chacabuco 1120 D 1903",
    typology: "Estudio",
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 0,
    bathrooms_count: 1,
    has_terrace_living: true,
    has_terrace_bedroom: false,
    has_walking_closet: false,
    has_logia: true,
    has_storage: false,
    has_parking: false,
    has_front_yard: false,
    warranty_deposit: 350000,
    tower: "2",
    unit_number: "1903",
    tenant_name: "María González",
    tenant_whatsapp: "+56912345678",
    fecha_inspeccion: "2026-03-20",
    recipient_email: "rosangel.gutierrez@homie.test",
    scheduled_at: "2026-03-20T15:00:00Z",
    fecha_recoleccion_llaves: "2026-03-20",
    hora_recoleccion_llaves: "15:00",
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  twoBedTwoBath: {
    property_id: "RE0003100",
    market: "CL",
    property_name: "Av. Libertador 4500 801",
    address: "Av. Libertador Bernardo O'Higgins 4500, Depto 801",
    typology: "2D2B",
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 2,
    bathrooms_count: 2,
    has_terrace_living: true,
    has_terrace_bedroom: false,
    has_walking_closet: false,
    has_logia: true,
    has_storage: true,
    has_parking: true,
    has_front_yard: false,
    warranty_deposit: 850000,
    unit_number: "801",
    tenant_name: "Carlos Pérez",
    tenant_whatsapp: "+56987654321",
    fecha_inspeccion: "2026-03-23",
    scheduled_at: "2026-03-23T10:00:00Z",
    fecha_recoleccion_llaves: "2026-03-23",
    hora_recoleccion_llaves: "10:00",
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  houseWithYard: {
    property_id: "RE0004200",
    market: "CL",
    property_name: "Casa Los Robles 123",
    address: "Los Robles 123, Ñuñoa",
    typology: "3D2B",
    property_type: "casa",
    inspection_type: "check_in",
    bedrooms_count: 3,
    bathrooms_count: 2,
    has_terrace_living: false,
    has_terrace_bedroom: false,
    has_walking_closet: false,
    has_logia: true,
    has_storage: false,
    has_parking: true,
    has_front_yard: true,
    fecha_inspeccion: "2026-03-25",
    scheduled_at: "2026-03-25T14:00:00Z",
    fecha_recoleccion_llaves: "2026-03-25",
    hora_recoleccion_llaves: "14:00",
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  fullFeatures: {
    property_id: "RE0005300",
    market: "CL",
    property_name: "Torre Platinum 2201",
    address: "Av. Apoquindo 6000, Depto 2201",
    typology: "4D4B",
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 4,
    bathrooms_count: 4,
    has_terrace_living: true,
    has_terrace_bedroom: true,
    has_walking_closet: true,
    has_logia: true,
    has_storage: true,
    has_parking: true,
    has_front_yard: false,
    warranty_deposit: 1500000,
    unit_number: "2201",
    fecha_inspeccion: "2026-03-28",
    scheduled_at: "2026-03-28T09:00:00Z",
    fecha_recoleccion_llaves: "2026-03-28",
    hora_recoleccion_llaves: "09:00",
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  unscheduled: {
    property_id: "RE0006400",
    market: "CL",
    property_name: "Sin Agenda 100",
    address: "Calle Ejemplo 100, Santiago",
    typology: "1D1B",
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 1,
    bathrooms_count: 1,
    has_terrace_living: false,
    has_terrace_bedroom: false,
    has_walking_closet: false,
    has_logia: false,
    has_storage: false,
    has_parking: false,
    has_front_yard: false,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
};
