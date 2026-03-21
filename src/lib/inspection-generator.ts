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

const STATUS_OPTIONS = [
  { value: 'bueno', label: 'Bueno' },
  { value: 'regular', label: 'Regular' },
  { value: 'malo', label: 'Malo' },
  { value: 'no_aplica', label: 'No Aplica' },
];

function makeSpaceFields(sectionKey: string): GeneratedField[] {
  return [
    {
      field_key: `${sectionKey}_status`,
      field_label: 'Estado General',
      field_type: 'single_select',
      group_key: 'status',
      sort_order: 0,
      required: true,
      options_json: STATUS_OPTIONS,
    },
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

function makeKitchenFields(): GeneratedField[] {
  return [
    ...makeSpaceFields('kitchen'),
    {
      field_key: 'kitchen_countertop_status',
      field_label: 'Estado Mesón',
      field_type: 'single_select',
      group_key: 'status',
      sort_order: 3,
      required: false,
      options_json: STATUS_OPTIONS,
    },
    {
      field_key: 'kitchen_sink_status',
      field_label: 'Estado Lavaplatos',
      field_type: 'single_select',
      group_key: 'status',
      sort_order: 4,
      required: false,
      options_json: STATUS_OPTIONS,
    },
    {
      field_key: 'kitchen_faucet_status',
      field_label: 'Estado Grifería',
      field_type: 'single_select',
      group_key: 'status',
      sort_order: 5,
      required: false,
      options_json: STATUS_OPTIONS,
    },
  ];
}

function makeLogiaFields(): GeneratedField[] {
  return [
    ...makeSpaceFields('logia'),
    {
      field_key: 'logia_heater_type',
      field_label: 'Tipo Calefont',
      field_type: 'text',
      group_key: 'technical',
      sort_order: 3,
      required: false,
    },
    {
      field_key: 'logia_heater_maintenance_date',
      field_label: 'Última Mantención Calefont',
      field_type: 'date',
      group_key: 'technical',
      sort_order: 4,
      required: false,
    },
    {
      field_key: 'logia_gas_type',
      field_label: 'Tipo Gas',
      field_type: 'single_select',
      group_key: 'technical',
      sort_order: 5,
      required: false,
      options_json: [
        { value: 'natural', label: 'Gas Natural' },
        { value: 'licuado', label: 'Gas Licuado' },
        { value: 'none', label: 'Sin Gas' },
      ],
    },
  ];
}

function makeClosingFields(key: string, label: string): GeneratedField[] {
  return [
    {
      field_key: `${key}_observation`,
      field_label: `Observaciones ${label}`,
      field_type: 'textarea',
      group_key: 'observation',
      sort_order: 0,
      required: false,
    },
    {
      field_key: `${key}_photos`,
      field_label: 'Fotos',
      field_type: 'photo_upload',
      group_key: 'photo',
      sort_order: 1,
      required: false,
    },
  ];
}

function makeKeysFields(): GeneratedField[] {
  return [
    {
      field_key: 'keys_count',
      field_label: 'Cantidad de Llaves',
      field_type: 'number',
      group_key: 'info',
      sort_order: 0,
      required: true,
    },
    {
      field_key: 'keys_control_count',
      field_label: 'Cantidad de Controles',
      field_type: 'number',
      group_key: 'info',
      sort_order: 1,
      required: false,
    },
    {
      field_key: 'keys_observation',
      field_label: 'Observaciones',
      field_type: 'textarea',
      group_key: 'observation',
      sort_order: 2,
      required: false,
    },
    {
      field_key: 'keys_photos',
      field_label: 'Fotos',
      field_type: 'photo_upload',
      group_key: 'photo',
      sort_order: 3,
      required: false,
    },
  ];
}

function makeMeterFields(): GeneratedField[] {
  return [
    {
      field_key: 'meter_electricity',
      field_label: 'Lectura Electricidad',
      field_type: 'text',
      group_key: 'measurement',
      sort_order: 0,
      required: false,
    },
    {
      field_key: 'meter_water',
      field_label: 'Lectura Agua',
      field_type: 'text',
      group_key: 'measurement',
      sort_order: 1,
      required: false,
    },
    {
      field_key: 'meter_gas',
      field_label: 'Lectura Gas',
      field_type: 'text',
      group_key: 'measurement',
      sort_order: 2,
      required: false,
    },
    {
      field_key: 'meter_photos',
      field_label: 'Fotos Medidores',
      field_type: 'photo_upload',
      group_key: 'photo',
      sort_order: 3,
      required: false,
    },
  ];
}

export function generateSections(payload: PropertyPayload): GeneratedSection[] {
  const sections: GeneratedSection[] = [];
  let order = 0;

  // Base metadata
  sections.push({
    section_key: 'property_data',
    section_title: 'Datos de la Propiedad',
    section_type: 'property_meta',
    sort_order: order++,
    fields: [
      { field_key: 'property_id', field_label: 'ID Propiedad', field_type: 'text', group_key: 'info', sort_order: 0, required: false },
      { field_key: 'property_address', field_label: 'Dirección', field_type: 'text', group_key: 'info', sort_order: 1, required: false },
      { field_key: 'property_photos', field_label: 'Fotos Fachada', field_type: 'photo_upload', group_key: 'photo', sort_order: 2, required: false },
    ],
  });

  sections.push({
    section_key: 'handover_person',
    section_title: 'Persona que Entrega',
    section_type: 'handover_meta',
    sort_order: order++,
    fields: [
      { field_key: 'handover_name', field_label: 'Nombre', field_type: 'text', group_key: 'info', sort_order: 0, required: true },
      { field_key: 'handover_rut', field_label: 'RUT', field_type: 'text', group_key: 'info', sort_order: 1, required: false },
      { field_key: 'handover_phone', field_label: 'Teléfono', field_type: 'phone', group_key: 'info', sort_order: 2, required: false },
      { field_key: 'handover_email', field_label: 'Email', field_type: 'email', group_key: 'info', sort_order: 3, required: false },
    ],
  });

  // Access
  sections.push({
    section_key: 'access',
    section_title: 'Acceso',
    section_type: 'space_standard',
    sort_order: order++,
    fields: makeSpaceFields('access'),
  });

  // Living / Studio
  if (payload.typology?.toLowerCase() === 'estudio') {
    sections.push({
      section_key: 'living_dormitorio',
      section_title: 'Living / Dormitorio',
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
  }

  // Kitchen
  sections.push({
    section_key: 'kitchen',
    section_title: 'Cocina',
    section_type: 'space_standard',
    sort_order: order++,
    fields: makeKitchenFields(),
  });

  // Appliances
  sections.push({
    section_key: 'appliances',
    section_title: 'Electrodomésticos',
    section_type: 'space_standard',
    sort_order: order++,
    fields: makeSpaceFields('appliances'),
  });

  // Bedrooms (repeatable)
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

  // Bathrooms (repeatable)
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

  // Secondary spaces
  if (payload.has_terrace_living) {
    sections.push({
      section_key: 'terrace_living',
      section_title: 'Terraza Living',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: makeSpaceFields('terrace_living'),
    });
  }

  if (payload.has_terrace_bedroom) {
    sections.push({
      section_key: 'terrace_bedroom',
      section_title: 'Terraza Dormitorio',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: makeSpaceFields('terrace_bedroom'),
    });
  }

  if (payload.has_walking_closet) {
    sections.push({
      section_key: 'walking_closet',
      section_title: 'Walking Closet',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: makeSpaceFields('walking_closet'),
    });
  }

  if (payload.has_front_yard && payload.property_type?.toLowerCase() === 'casa') {
    sections.push({
      section_key: 'front_yard',
      section_title: 'Antejardín',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: makeSpaceFields('front_yard'),
    });
  }

  if (payload.has_storage || payload.has_parking) {
    sections.push({
      section_key: 'storage_and_parking',
      section_title: 'Bodega y Estacionamiento',
      section_type: 'space_secondary',
      sort_order: order++,
      fields: makeSpaceFields('storage_and_parking'),
    });
  }

  // Technical: Logia
  if (payload.has_logia) {
    sections.push({
      section_key: 'logia',
      section_title: 'Logia',
      section_type: 'space_technical',
      sort_order: order++,
      fields: makeLogiaFields(),
    });
  }

  // Closing sections
  sections.push({
    section_key: 'cleaning',
    section_title: 'Aseo General',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: [
      {
        field_key: 'cleaning_status',
        field_label: 'Estado de Aseo',
        field_type: 'single_select',
        group_key: 'status',
        sort_order: 0,
        required: true,
        options_json: STATUS_OPTIONS,
      },
      ...makeClosingFields('cleaning', 'Aseo').slice(0), // observation + photos
    ],
  });

  sections.push({
    section_key: 'keys_information',
    section_title: 'Información de Llaves',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: makeKeysFields(),
  });

  sections.push({
    section_key: 'pest_control',
    section_title: 'Control de Plagas',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: makeClosingFields('pest_control', 'Control de Plagas'),
  });

  sections.push({
    section_key: 'meter_readings',
    section_title: 'Lecturas de Medidores',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: makeMeterFields(),
  });

  sections.push({
    section_key: 'additional_information',
    section_title: 'Información Adicional',
    section_type: 'closing_summary',
    sort_order: order++,
    fields: makeClosingFields('additional', 'Adicional'),
  });

  return sections;
}

export function normalizePropertySnapshot(payload: PropertyPayload): Record<string, unknown> {
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
    scheduled_at: payload.scheduled_at,
    fecha_recoleccion_llaves: payload.fecha_recoleccion_llaves,
    hora_recoleccion_llaves: payload.hora_recoleccion_llaves,
  };
}

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
    tower: "2",
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
    scheduled_at: "2026-03-22T10:00:00Z",
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
    scheduled_at: "2026-03-25T14:00:00Z",
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
    scheduled_at: "2026-03-28T09:00:00Z",
    inspector: { id: "REPLACE_WITH_REAL_ID", name: "Inspector Demo", email: "inspector@homie.test" },
    executive: { id: "REPLACE_WITH_REAL_ID", name: "Executive Demo", email: "executive@homie.test" },
  },
};
