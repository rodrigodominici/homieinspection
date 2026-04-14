/**
 * Dynamic inspection section generation — V4 (15-screen model).
 *
 * This generator creates the 15-screen inspection structure.
 * Existing inspections retain their stored `generated_structure_json` and are unaffected.
 *
 * Screen order:
 * 1.  Introducción              (always)
 * 2.  Datos del inmueble        (always)
 * 3.  Datos del inquilino       (always)
 * 4.  Acceso                    (always)
 * 5.  Living                    (always)
 * 6.  Cocina / Electrodomésticos (always, Logia always inside)
 * 7.  Dormitorio 1..N           (NOT estudio; repeat bedrooms_count — includes 1D)
 * 8.  Walking Closet            (NOT estudio — after last Dormitorio)
 * 9.  Baño 1..N                 (always, min 1; repeat bathrooms_count)
 * 10. Terraza / Patio Trasero   (always)
 * 11. Patio Delantero           (property_type = casa)
 * 12. Otros Generales           (always — cross-cutting handover items)
 * 13. Bodega                    (has_storage = true)
 * 14. Estacionamiento           (has_parking = true)
 * 15. Firma de inquilino        (always, final)
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

// ─── Legacy payload field mapping & property_type canonicalization ───────
function normalizeIncomingPayload(raw: PropertyPayload): PropertyPayload {
  // ── Canonical property_type derivation ──
  let propertyType = raw.property_type?.toLowerCase()?.trim() || null;

  // Normalize alias: estudio_loft → estudio
  if (propertyType === 'estudio_loft') propertyType = 'estudio';

  // Last-resort backward-compat fallback: derive from typology ONLY if
  // property_type is absent. This is NOT the ideal contract — callers
  // should always provide a valid property_type.
  if (!propertyType && raw.typology?.toLowerCase() === 'estudio') {
    propertyType = 'estudio';
  }

  return {
    ...raw,
    property_type: propertyType ?? raw.property_type,
    recipient_email: raw.recipient_email ?? (raw as any).correo_receptora ?? null,
    tenant_name: raw.tenant_name ?? (raw as any).nombre_inquilino ?? null,
    tenant_whatsapp: raw.tenant_whatsapp ?? (raw as any).whatsapp_inquilino ?? null,
    unit_number: raw.unit_number ?? (raw as any).numero_depto ?? null,
    parking_number: raw.parking_number ?? (raw as any).numero_estacionamiento ?? null,
    storage_number: raw.storage_number ?? (raw as any).numero_bodega ?? null,
    fecha_de_termino_real_de_contrato: raw.fecha_de_termino_real_de_contrato ?? (raw as any).contract_end_date ?? null,
    fecha_de_recepcion_del_checkout_cl: raw.fecha_de_recepcion_del_checkout_cl ?? (raw as any).checkout_received_date ?? null,
  };
}

// ─── Shared helpers ─────────────────────────────────────────────────────

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

/**
 * Generate per-item status matrix fields for a space section.
 * Each item gets its own Bueno/Regular/Malo/NA selector.
 */
function makeMatrixFields(
  sectionKey: string,
  items: string[],
  groupKey = 'status',
): GeneratedField[] {
  return items.map((item, idx) => {
    const fieldKey = `${sectionKey}_${item.toLowerCase().replace(/[\s\/()]+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    return makeStatusField(fieldKey, item, idx, groupKey);
  });
}

function makeObservationField(sectionKey: string, label: string, sortOrder: number): GeneratedField {
  return {
    field_key: `${sectionKey}_observation`,
    field_label: label,
    field_type: 'textarea',
    group_key: 'observation',
    sort_order: sortOrder,
    required: false,
  };
}

function makePhotoField(sectionKey: string, label: string, sortOrder: number): GeneratedField {
  return {
    field_key: `${sectionKey}_photos`,
    field_label: label,
    field_type: 'photo_upload',
    group_key: 'photo',
    sort_order: sortOrder,
    required: false,
  };
}

// ─── Studio detection ───────────────────────────────────────────────────
//
// Classification is based SOLELY on property_type (canonical).
// property_type is normalized upstream by normalizeIncomingPayload:
//   - 'estudio_loft' → 'estudio'
//   - missing property_type + typology='estudio' → 'estudio' (legacy fallback)
//
// typology is DEPRECATED — stored in snapshots for reference only, never
// consumed by any conditional logic after normalization.
// bedrooms_count is used only for bedroom repetition, never classification.

export function isStudio(payload: PropertyPayload): boolean {
  return payload.property_type?.toLowerCase() === 'estudio';
}

// ─── 15-Screen Generation ───────────────────────────────────────────────

export function generateSections(rawPayload: PropertyPayload): GeneratedSection[] {
  const payload = normalizeIncomingPayload(rawPayload);
  const sections: GeneratedSection[] = [];
  let order = 0;
  const studio = isStudio(payload);
  const isCasa = payload.property_type?.toLowerCase() === 'casa';

  // ── 1. Introducción ────────────────────────────────────────────────────
  const introFields: GeneratedField[] = [
    // Cleaning sub-group (inspector captures on arrival)
    {
      field_key: 'cleaning_status', field_label: 'Estado de Aseo', field_type: 'single_select',
      group_key: 'cleaning', sort_order: 0, required: false,
      options_json: STATUS_OPTIONS,
    },
    { field_key: 'cleaning_observation', field_label: 'Observaciones Aseo', field_type: 'textarea', group_key: 'cleaning', sort_order: 1, required: false },
    // Removal sub-group
    {
      field_key: 'removal_status', field_label: 'Retiro de Enseres', field_type: 'single_select',
      group_key: 'removal', sort_order: 2, required: false,
      options_json: [{ value: 'completo', label: 'Completo' }, { value: 'parcial', label: 'Parcial' }, { value: 'no_realizado', label: 'No Realizado' }],
    },
    // Fumigation sub-group
    { field_key: 'fumigation_observation', field_label: 'Observaciones Fumigación', field_type: 'textarea', group_key: 'fumigation', sort_order: 3, required: false },
    { field_key: 'fumigation_photos', field_label: 'Fotos Fumigación', field_type: 'photo_upload', group_key: 'fumigation', sort_order: 4, required: false },
  ];

  sections.push({
    section_key: 'introduction',
    section_title: 'Introducción',
    section_type: 'introduction',
    sort_order: order++,
    fields: introFields,
  });

  // ── 2. Datos del inmueble ──────────────────────────────────────────────
  const propertyFields: GeneratedField[] = [
    // Context fields (read-only from payload)
    { field_key: 'ctx_market', field_label: 'Mercado', field_type: 'text', group_key: 'context', sort_order: 0, required: false },
    { field_key: 'ctx_property_id', field_label: 'ID Inmueble', field_type: 'text', group_key: 'context', sort_order: 1, required: false },
    { field_key: 'ctx_address', field_label: 'Dirección Inmueble', field_type: 'text', group_key: 'context', sort_order: 2, required: false },
    { field_key: 'ctx_unit_number', field_label: 'Nº Dpto/Casa', field_type: 'text', group_key: 'context', sort_order: 3, required: false },
    { field_key: 'ctx_tower', field_label: 'Torre', field_type: 'text', group_key: 'context', sort_order: 4, required: false },
    { field_key: 'ctx_parking', field_label: 'Estacionamiento', field_type: 'text', group_key: 'context', sort_order: 5, required: false },
    { field_key: 'ctx_storage', field_label: 'Bodega', field_type: 'text', group_key: 'context', sort_order: 6, required: false },
    { field_key: 'ctx_fecha_recoleccion', field_label: 'Recolección de llaves / inspección', field_type: 'text', group_key: 'context', sort_order: 7, required: false },
    { field_key: 'ctx_recipient_email', field_label: 'Correo Receptora/o', field_type: 'email', group_key: 'context', sort_order: 8, required: false },
    { field_key: 'ctx_inspection_type', field_label: 'Tipo de Recepción', field_type: 'text', group_key: 'context', sort_order: 9, required: false },
    { field_key: 'ctx_property_type', field_label: 'Tipo de Propiedad', field_type: 'text', group_key: 'context', sort_order: 10, required: false },
    { field_key: 'ctx_bedrooms', field_label: 'Dormitorios', field_type: 'number', group_key: 'context', sort_order: 11, required: false },
    { field_key: 'ctx_bathrooms', field_label: 'Baños', field_type: 'number', group_key: 'context', sort_order: 12, required: false },
    // Meters sub-group (inspector input)
    { field_key: 'meter_electricity', field_label: 'Lectura Electricidad', field_type: 'text', group_key: 'meters', sort_order: 20, required: false },
    { field_key: 'meter_water', field_label: 'Lectura Agua', field_type: 'text', group_key: 'meters', sort_order: 21, required: false },
    { field_key: 'meter_gas', field_label: 'Lectura Gas', field_type: 'text', group_key: 'meters', sort_order: 22, required: false },
    { field_key: 'meter_photos', field_label: 'Fotos Medidores', field_type: 'photo_upload', group_key: 'meters', sort_order: 23, required: false },
    // Admin contact sub-group (inspector input)
    { field_key: 'admin_name', field_label: 'Nombre Administrador / Mayordomo', field_type: 'text', group_key: 'admin_contact', sort_order: 30, required: false },
    { field_key: 'admin_phone', field_label: 'Teléfono Administrador', field_type: 'phone', group_key: 'admin_contact', sort_order: 31, required: false },
    { field_key: 'admin_email', field_label: 'Correo Administrador', field_type: 'email', group_key: 'admin_contact', sort_order: 32, required: false },
  ];

  sections.push({
    section_key: 'property_data',
    section_title: 'Datos del Inmueble',
    section_type: 'reception_meta',
    sort_order: order++,
    fields: propertyFields,
  });

  // ── 3. Datos del inquilino / quien entrega ─────────────────────────────
  sections.push({
    section_key: 'handover_person',
    section_title: 'Datos del Inquilino / Quien Entrega',
    section_type: 'handover_meta',
    sort_order: order++,
    fields: [
      { field_key: 'handover_tenant_name', field_label: 'Nombre y Apellido del Inquilino', field_type: 'text', group_key: 'info', sort_order: 0, required: false },
      { field_key: 'handover_name', field_label: 'Nombre y Apellido de Quien Entrega', field_type: 'text', group_key: 'info', sort_order: 1, required: true },
      { field_key: 'handover_email', field_label: 'Email de Quien Entrega', field_type: 'email', group_key: 'info', sort_order: 2, required: false },
      { field_key: 'handover_phone', field_label: 'Teléfono de Quien Entrega', field_type: 'phone', group_key: 'info', sort_order: 3, required: false },
    ],
  });

  // ── 4. Acceso ──────────────────────────────────────────────────────────
  const accessItems = [
    'Puerta', 'Cerradura / Chapa', 'Muros / Murallas', 'Techo', 'Piso',
    'Enchufes', 'Interruptor', 'Lámparas', 'Tablero eléctrico', 'Timbre',
    'Armario', 'Alarma', 'Citófono',
  ];
  sections.push({
    section_key: 'access',
    section_title: 'Acceso',
    section_type: 'space_standard',
    sort_order: order++,
    fields: [
      ...makeMatrixFields('access', accessItems),
      makeObservationField('access', 'Observaciones Acceso', accessItems.length),
      makePhotoField('access', 'Fotos Acceso', accessItems.length + 1),
    ],
  });

  // ── 5. Living ──────────────────────────────────────────────────────────
  const livingItems = [
    'Armario', 'Cortinero', 'Muros / Muralla', 'Piso', 'Techo',
    'Ventana', 'Lámparas', 'Enchufes', 'Interruptores',
  ];
  sections.push({
    section_key: 'living',
    section_title: 'Living',
    section_type: 'space_standard',
    sort_order: order++,
    fields: [
      ...makeMatrixFields('living', livingItems),
      makeObservationField('living', 'Observaciones Living', livingItems.length),
      makePhotoField('living', 'Fotos Living', livingItems.length + 1),
    ],
  });

  // ── 6. Cocina / Electrodomésticos ──────────────────────────────────────
  const kitchenItems = [
    'Puerta', 'Piso', 'Muros / Muralla', 'Techo', 'Lámparas', 'Interruptores',
    'Mesón de cocina', 'Mobiliario / cajones', 'Grifo', 'Lavaplatos',
    'Desagüe (sifón)', 'Enchufes',
  ];
  const applianceItems = [
    'Campana', 'Encimera / Parrilla', 'Horno', 'Microondas', 'Refrigerador',
  ];
  const kitchenFields: GeneratedField[] = [
    ...makeMatrixFields('kitchen', kitchenItems, 'status'),
    ...makeMatrixFields('kitchen_app', applianceItems, 'appliance'),
    // Technical selectors
    {
      field_key: 'encimera_type', field_label: 'Tipo de Encimera / Parrilla', field_type: 'single_select', group_key: 'technical', sort_order: 50, required: false,
      options_json: [
        { value: 'gas', label: 'A Gas' }, { value: 'electrica', label: 'Eléctrica' },
        { value: 'vitroceramica', label: 'Vitrocerámica' }, { value: 'no_tiene', label: 'No tiene encimera' },
      ],
    },
    {
      field_key: 'platos_count', field_label: 'Cant. de platos Encimera / Parrilla', field_type: 'single_select', group_key: 'technical', sort_order: 51, required: false,
      options_json: [
        { value: '2', label: '2 Platos' }, { value: '3', label: '3 Platos' },
        { value: '4', label: '4 Platos' }, { value: 'no_tiene', label: 'No tiene encimera' },
      ],
    },
    {
      field_key: 'horno_type', field_label: 'Tipo de Horno', field_type: 'single_select', group_key: 'technical', sort_order: 52, required: false,
      options_json: [
        { value: 'gas', label: 'A gas' }, { value: 'electrico', label: 'Eléctrico' },
        { value: 'no_tiene', label: 'No tiene horno' },
      ],
    },
    // Logia o Armario de Boiler/Calentador — 8-item matrix
    ...makeMatrixFields('logia', [
      'Calefón', 'Thermo', 'Inspección Gas', 'Grifería Lavadero',
      'Lámpara', 'Enchufes', 'Interruptor', 'Armario',
    ], 'logia_matrix'),
    // Logia observation + photos
    { field_key: 'logia_observation', field_label: 'Observaciones Logia', field_type: 'textarea', group_key: 'logia', sort_order: 68, required: false },
    { field_key: 'logia_photos', field_label: 'Fotos Logia', field_type: 'photo_upload', group_key: 'logia', sort_order: 69, required: false },
    // Shared observation/photos
    makeObservationField('kitchen', 'Observaciones Cocina y Electrodomésticos', 70),
    makePhotoField('kitchen', 'Fotos Cocina y Electrodomésticos', 71),
  ];

  sections.push({
    section_key: 'kitchen_appliances',
    section_title: 'Cocina / Electrodomésticos',
    section_type: 'space_kitchen',
    sort_order: order++,
    fields: kitchenFields,
  });

  // ── 7. Dormitorios (NOT estudio) ───────────────────────────────────────
  if (!studio) {
    const bedroomCount = Math.max(payload.bedrooms_count ?? 1, 1);
    const bedroomItems = [
      'Puerta', 'Techo', 'Muros / Muralla', 'Piso / Alfombra', 'Cortinero',
      'Ventana', 'Lámparas', 'Enchufes', 'Interruptores', 'Closet / Armario',
    ];
    for (let i = 1; i <= bedroomCount; i++) {
      const key = `bedroom_${i}`;
      sections.push({
        section_key: key,
        section_title: bedroomCount === 1 ? 'Dormitorio' : `Dormitorio ${i}`,
        section_type: 'space_standard',
        sort_order: order++,
        fields: [
          ...makeMatrixFields(key, bedroomItems),
          makeObservationField(key, 'Observaciones Dormitorio', bedroomItems.length),
          makePhotoField(key, 'Fotos Dormitorio', bedroomItems.length + 1),
        ],
      });
    }


    // ── 8. Walking Closet (NOT estudio — after last Dormitorio) ──────────
    const wcItems = [
      'Puerta', 'Techo', 'Piso / Alfombra', 'Mobiliario', 'Lámparas', 'Interruptores',
    ];
    sections.push({
      section_key: 'walking_closet',
      section_title: 'Walking Closet',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: [
        ...makeMatrixFields('walking_closet', wcItems),
        makeObservationField('walking_closet', 'Observaciones Walking Closet', wcItems.length),
        makePhotoField('walking_closet', 'Fotos Walking Closet', wcItems.length + 1),
      ],
    });
  }

  // ── 9. Baños (always, min 1) ───────────────────────────────────────────
  const bathroomCount = Math.max(payload.bathrooms_count ?? 1, 1);
  const bathroomItems = [
    'Puerta', 'Interruptor', 'Lámpara', 'Techo', 'Piso', 'Muros / Baldosas',
    'Ventana', 'Inodoro', 'Mobiliario / Espejo', 'Enchufes', 'Extractor / Rejilla',
    'Tina / Ducha', 'Grifería tina', 'Lavamanos', 'Grifería lavamanos',
    'Desagüe y sifones', 'Accesorios',
  ];
  for (let i = 1; i <= bathroomCount; i++) {
    const key = studio && bathroomCount === 1 ? 'bathroom_studio' : `bathroom_${i}`;
    sections.push({
      section_key: key,
      section_title: bathroomCount === 1 ? 'Baño' : `Baño ${i}`,
      section_type: 'space_standard',
      sort_order: order++,
      fields: [
        ...makeMatrixFields(key, bathroomItems),
        makeObservationField(key, 'Observaciones Baño', bathroomItems.length),
        makePhotoField(key, 'Fotos Baño', bathroomItems.length + 1),
      ],
    });
  }

  // ── 10. Terraza / Patio Trasero (always) ───────────────────────────────
  const terraceItems = [
    'Baranda', 'Techo', 'Muros / Murallas', 'Piso', 'Desagüe',
    'Lámparas', 'Enchufes', 'Interruptores',
  ];
  sections.push({
    section_key: 'terrace_patio',
    section_title: 'Terraza / Patio Trasero',
    section_type: 'space_secondary',
    sort_order: order++,
    fields: [
      ...makeMatrixFields('terrace', terraceItems),
      makeObservationField('terrace', 'Observaciones Terraza', terraceItems.length),
      makePhotoField('terrace', 'Fotos Terraza', terraceItems.length + 1),
    ],
  });

  // ── 11. Patio Delantero (casa only) ────────────────────────────────────
  if (isCasa) {
    const frontYardItems = [
      'Baranda', 'Techo', 'Muros / Murallas', 'Piso', 'Desagüe',
      'Lámparas', 'Enchufes', 'Interruptores', 'Citófono', 'Portón vehicular',
    ];
    sections.push({
      section_key: 'front_yard',
      section_title: 'Patio Delantero',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: [
        ...makeMatrixFields('front_yard', frontYardItems),
        makeObservationField('front_yard', 'Observaciones Patio Delantero', frontYardItems.length),
        makePhotoField('front_yard', 'Fotos Patio Delantero', frontYardItems.length + 1),
      ],
    });
  }

  // ── 12. Otros Generales (always — closing operational form) ─────────────
  sections.push({
    section_key: 'otros_generales',
    section_title: 'Otros Generales',
    section_type: 'closing_operational',
    sort_order: order++,
    fields: [
      {
        field_key: 'og_limpieza', field_label: '¿Se requiere limpieza?', field_type: 'single_select',
        group_key: 'operational', sort_order: 0, required: true,
        options_json: [
          { value: 'profunda', label: 'Profunda' },
          { value: 'basica', label: 'Básica' },
          { value: 'no_requiere', label: 'No se requiere limpieza' },
        ],
      },
      {
        field_key: 'og_retiro_enseres', field_label: '¿Retiro de Enseres (Inmueble / Bodega)?', field_type: 'single_select',
        group_key: 'operational', sort_order: 1, required: true,
        options_json: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
      },
      {
        field_key: 'og_fumigacion', field_label: '¿Requiere Fumigación?', field_type: 'single_select',
        group_key: 'operational', sort_order: 2, required: true,
        options_json: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
      },
      { field_key: 'og_medidores_obs', field_label: 'Observaciones / Lectura y Número de medidores (Luz / Agua / Gas)', field_type: 'textarea', group_key: 'operational', sort_order: 3, required: false },
      { field_key: 'og_medidores_photos', field_label: 'Fotos Medidores y Otras', field_type: 'photo_upload', group_key: 'operational', sort_order: 4, required: false },
      { field_key: 'og_admin_contacto', field_label: 'Nombre Administrador / Mayordomo, teléfono y correo electrónico', field_type: 'textarea', group_key: 'operational', sort_order: 5, required: false },
    ],
  });

  // ── 13. Bodega (conditional: has_storage) ──────────────────────────────
  if (payload.has_storage) {
    const bodegaItems = [
      'Puerta', 'Techo', 'Muros / Muralla', 'Piso', 'Cerradura',
      'Lámparas', 'Interruptores',
    ];
    sections.push({
      section_key: 'bodega',
      section_title: 'Bodega',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: [
        ...makeMatrixFields('bodega', bodegaItems),
        makeObservationField('bodega', 'Observaciones Bodega', bodegaItems.length),
        makePhotoField('bodega', 'Fotos Bodega', bodegaItems.length + 1),
      ],
    });
  }

  // ── 14. Estacionamiento (conditional: has_parking) ──────────────────────
  if (payload.has_parking) {
    sections.push({
      section_key: 'estacionamiento',
      section_title: 'Estacionamiento',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: [
        makePhotoField('estacionamiento', 'Fotos Estacionamiento', 0),
      ],
    });
  }

  // ── 15. Firma de inquilino (always, final) ─────────────────────────────
  sections.push({
    section_key: 'tenant_signature',
    section_title: 'Firma de Inquilino',
    section_type: 'signature',
    sort_order: order++,
    fields: [
      { field_key: 'general_observation', field_label: 'Observaciones Generales', field_type: 'textarea', group_key: 'observation', sort_order: 0, required: false },
      { field_key: 'additional_photos', field_label: 'Fotos Adicionales', field_type: 'photo_upload', group_key: 'photo', sort_order: 1, required: false },
    ],
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
    has_storage: payload.has_storage ?? false,
    has_parking: payload.has_parking ?? false,
    tower: payload.tower,
    warranty_deposit: payload.warranty_deposit ?? null,
    tenant_name: payload.tenant_name ?? null,
    tenant_whatsapp: payload.tenant_whatsapp ?? null,
    unit_number: payload.unit_number ?? null,
    parking_number: payload.parking_number ?? null,
    storage_number: payload.storage_number ?? null,
    recipient_email: payload.recipient_email ?? null,
    fecha_recoleccion_llaves: payload.fecha_recoleccion_llaves,
    hora_recoleccion_llaves: payload.hora_recoleccion_llaves,
    fecha_de_termino_real_de_contrato: payload.fecha_de_termino_real_de_contrato ?? null,
    fecha_de_recepcion_del_checkout_cl: payload.fecha_de_recepcion_del_checkout_cl ?? null,
  };
}

// ─── Example payloads (new contract — removed 5 boolean flags) ──────────

export const EXAMPLE_PAYLOADS = {
  studio: {
    hubspot_property_id: "hs_prop_12345",
    property_id: "RE0002496",
    market: "CL",
    property_name: "Chacabuco 1120 1903",
    address: "Matucana 1161 Chacabuco 1120 D 1903",
    typology: "Estudio",              // @deprecated — informational only
    property_type: "estudio",          // canonical source of truth
    inspection_type: "check_out",
    bedrooms_count: 0,
    bathrooms_count: 1,
    has_storage: false,
    has_parking: false,
    warranty_deposit: 350000,
    tower: "2",
    unit_number: "1903",
    tenant_name: "María González",
    tenant_whatsapp: "+56912345678",
    recipient_email: "rosangel.gutierrez@homie.test",
    fecha_recoleccion_llaves: "2026-03-20",
    hora_recoleccion_llaves: "15:00",
    fecha_de_termino_real_de_contrato: "2026-03-15",
    fecha_de_recepcion_del_checkout_cl: null as any,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  twoBedTwoBath: {
    property_id: "RE0003100",
    market: "CL",
    property_name: "Av. Libertador 4500 801",
    address: "Av. Libertador Bernardo O'Higgins 4500, Depto 801",
    typology: "2D2B",                  // @deprecated — informational only
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 2,
    bathrooms_count: 2,
    has_storage: true,
    has_parking: true,
    warranty_deposit: 850000,
    unit_number: "801",
    tenant_name: "Carlos Pérez",
    tenant_whatsapp: "+56987654321",
    fecha_de_termino_real_de_contrato: "2026-03-18",
    fecha_de_recepcion_del_checkout_cl: null as any,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  houseWithYard: {
    property_id: "RE0004200",
    market: "CL",
    property_name: "Casa Los Robles 123",
    address: "Los Robles 123, Ñuñoa",
    typology: "3D2B",                  // @deprecated — informational only
    property_type: "casa",
    inspection_type: "check_in",
    bedrooms_count: 3,
    bathrooms_count: 2,
    has_storage: false,
    has_parking: true,
    fecha_recoleccion_llaves: "2026-03-25",
    hora_recoleccion_llaves: "14:00",
    fecha_de_termino_real_de_contrato: "2026-03-20",
    fecha_de_recepcion_del_checkout_cl: null as any,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  fullFeatures: {
    property_id: "RE0005300",
    market: "CL",
    property_name: "Torre Platinum 2201",
    address: "Av. Apoquindo 6000, Depto 2201",
    typology: "4D4B",                  // @deprecated — informational only
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 4,
    bathrooms_count: 4,
    has_storage: true,
    has_parking: true,
    warranty_deposit: 1500000,
    unit_number: "2201",
    fecha_recoleccion_llaves: "2026-03-28",
    hora_recoleccion_llaves: "09:00",
    fecha_de_termino_real_de_contrato: "2026-03-22",
    fecha_de_recepcion_del_checkout_cl: null as any,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
  unscheduled: {
    property_id: "RE0006400",
    market: "CL",
    property_name: "Sin Agenda 100",
    address: "Calle Ejemplo 100, Santiago",
    typology: "1D1B",                  // @deprecated — informational only
    property_type: "departamento",
    inspection_type: "check_out",
    bedrooms_count: 1,
    bathrooms_count: 1,
    has_storage: false,
    has_parking: false,
    tenant_name: "Pedro Soto",
    tenant_whatsapp: "+56911112222",
    fecha_de_termino_real_de_contrato: "2026-04-15",
    fecha_recoleccion_llaves: null as any,
    fecha_de_recepcion_del_checkout_cl: null as any,
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
};
