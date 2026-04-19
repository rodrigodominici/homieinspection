/**
 * CANONICAL: supabase/functions/_shared/inspection-generator.ts
 * Mirror in src/lib/inspection-generator.ts — sync manually until consolidation.
 *
 * Dynamic inspection section generation — V4 (15-screen model).
 * Used by HubSpot intake (and any future external webhook) to produce the
 * same structure the manual flow generates client-side.
 *
 * Keep this file in sync with src/lib/inspection-generator.ts.
 * Generator drift is the #1 risk: a parity test exists in src/test/generator-parity.test.ts.
 */

export interface PropertyPayload {
  hubspot_property_id?: string;
  property_id: string;
  market: string;
  property_name?: string;
  address?: string;
  property_type?: string;
  inspection_type: string;
  bedrooms_count?: number;
  bathrooms_count?: number;
  has_storage?: boolean;
  has_parking?: boolean;
  tower?: string;
  comuna?: string;
  recipient_email?: string;
  warranty_deposit?: number;
  tenant_name?: string;
  tenant_whatsapp?: string;
  unit_number?: string;
  parking_number?: string;
  storage_number?: string;
  scheduled_at?: string;
  fecha_recoleccion_llaves?: string;
  hora_recoleccion_llaves?: string;
  fecha_de_termino_real_de_contrato?: string;
  fecha_de_recepcion_del_checkout_cl?: string;
  inspector?: { id?: string; name?: string; email?: string };
  executive?: { id?: string; name?: string; email?: string };
  [key: string]: unknown;
}

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

export function normalizeIncomingPayload(raw: PropertyPayload): PropertyPayload {
  let propertyType = raw.property_type?.toLowerCase()?.trim() || null;
  if (propertyType === 'estudio_loft') propertyType = 'estudio';

  return {
    ...raw,
    property_type: propertyType ?? raw.property_type,
    recipient_email: raw.recipient_email ?? (raw as any).correo_receptora ?? undefined,
    tenant_name: raw.tenant_name ?? (raw as any).nombre_inquilino ?? undefined,
    tenant_whatsapp: raw.tenant_whatsapp ?? (raw as any).whatsapp_inquilino ?? undefined,
    unit_number: raw.unit_number ?? (raw as any).numero_depto ?? undefined,
    parking_number: raw.parking_number ?? (raw as any).numero_estacionamiento ?? undefined,
    storage_number: raw.storage_number ?? (raw as any).numero_bodega ?? undefined,
    fecha_de_termino_real_de_contrato: raw.fecha_de_termino_real_de_contrato ?? (raw as any).contract_end_date ?? undefined,
    fecha_de_recepcion_del_checkout_cl: raw.fecha_de_recepcion_del_checkout_cl ?? (raw as any).checkout_received_date ?? undefined,
  };
}

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

function makeMatrixFields(sectionKey: string, items: string[], groupKey = 'status'): GeneratedField[] {
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

export function isStudio(payload: PropertyPayload): boolean {
  return payload.property_type?.toLowerCase() === 'estudio';
}

export function generateSections(rawPayload: PropertyPayload): GeneratedSection[] {
  const payload = normalizeIncomingPayload(rawPayload);
  const sections: GeneratedSection[] = [];
  let order = 0;
  const studio = isStudio(payload);
  const isCasa = payload.property_type?.toLowerCase() === 'casa';

  // 1. Introducción
  sections.push({
    section_key: 'introduction',
    section_title: 'Introducción',
    section_type: 'introduction',
    sort_order: order++,
    fields: [{
      field_key: 'intro_observation',
      field_label: 'Observación inicial (opcional)',
      field_type: 'textarea',
      group_key: 'briefing',
      sort_order: 0,
      required: false,
    }],
  });

  // 2. Datos del inmueble
  sections.push({
    section_key: 'property_data',
    section_title: 'Datos del Inmueble',
    section_type: 'reception_meta',
    sort_order: order++,
    fields: [
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
    ],
  });

  // 3. Datos del inquilino
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

  // 4. Acceso
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
      { field_key: 'access_keys_observation', field_label: 'Observaciones Llaves / Tarjeta', field_type: 'textarea', group_key: 'keys', sort_order: accessItems.length + 2, required: false },
      { field_key: 'access_keys_photos', field_label: 'Fotos de Llaves / Tarjeta', field_type: 'photo_upload', group_key: 'keys', sort_order: accessItems.length + 3, required: false },
    ],
  });

  // 5. Living
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

  // 6. Cocina / Electrodomésticos
  const kitchenItems = [
    'Puerta', 'Piso', 'Muros / Muralla', 'Techo', 'Lámparas', 'Interruptores',
    'Mesón de cocina', 'Mobiliario / cajones', 'Grifo', 'Lavaplatos',
    'Desagüe (sifón)', 'Enchufes',
  ];
  const applianceItems = ['Campana', 'Encimera / Parrilla', 'Horno', 'Microondas', 'Refrigerador'];
  const kitchenFields: GeneratedField[] = [
    ...makeMatrixFields('kitchen', kitchenItems, 'status'),
    ...makeMatrixFields('kitchen_app', applianceItems, 'appliance'),
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
    makeObservationField('kitchen', 'Observaciones Cocina y Electrodomésticos', 60),
    makePhotoField('kitchen', 'Fotos Cocina y Electrodomésticos', 61),
    ...makeMatrixFields('logia', [
      'Calefón', 'Thermo', 'Inspección Gas', 'Grifería Lavadero',
      'Lámpara', 'Enchufes', 'Interruptor', 'Armario',
    ], 'logia_matrix'),
    { field_key: 'logia_observation', field_label: 'Observaciones Logia', field_type: 'textarea', group_key: 'logia', sort_order: 78, required: false },
    { field_key: 'logia_photos', field_label: 'Fotos Logia', field_type: 'photo_upload', group_key: 'logia', sort_order: 79, required: false },
  ];

  sections.push({
    section_key: 'kitchen_appliances',
    section_title: 'Cocina / Electrodomésticos',
    section_type: 'space_kitchen',
    sort_order: order++,
    fields: kitchenFields,
  });

  // 7. Dormitorios + 8. Walking Closet
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

    const wcItems = ['Puerta', 'Techo', 'Piso / Alfombra', 'Mobiliario', 'Lámparas', 'Interruptores'];
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

  // 9. Baños
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

  // 10. Terraza / Patio Trasero
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

  // 11. Patio Delantero (casa only)
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

  // 12. Otros Generales
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

  // 13. Bodega
  if (payload.has_storage) {
    const bodegaItems = ['Puerta', 'Techo', 'Muros / Muralla', 'Piso', 'Cerradura', 'Lámparas', 'Interruptores'];
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

  // 14. Estacionamiento
  if (payload.has_parking) {
    sections.push({
      section_key: 'estacionamiento',
      section_title: 'Estacionamiento',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: [
        makePhotoField('estacionamiento', 'Fotos Estacionamiento', 0),
        makeObservationField('estacionamiento', 'Observaciones Estacionamiento', 1),
      ],
    });
  }

  // 15. Firma de inquilino
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
