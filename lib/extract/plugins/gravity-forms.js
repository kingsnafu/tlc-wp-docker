import { query, phpUnserialize } from '../../connect/database.js';

/**
 * Extract Gravity Forms definitions from the WordPress database.
 * Reads form structure and field definitions from gf_form and gf_form_meta tables.
 */
export async function extractGravityForms(config) {
  const prefix = config.wordpress.table_prefix;

  // Get all active forms
  const formRows = query(
    `SELECT id, title, date_created, is_active FROM ${prefix}gf_form WHERE is_active = 1`,
    config,
    { columns: ['id', 'title', 'date_created', 'is_active'] }
  );

  if (!formRows.length) {
    console.log('  Forms: 0');
    return { files: [], data: { forms: [] } };
  }

  const forms = [];

  for (const form of formRows) {
    const formId = form.id;

    // Get form meta (contains serialized field definitions)
    const metaRows = query(
      `SELECT display_meta FROM ${prefix}gf_form_meta WHERE form_id = ${formId}`,
      config
    );

    let fields = [];
    const rawMeta = metaRows[0]?.[0];

    if (rawMeta) {
      try {
        // GF stores display_meta as JSON (newer versions) or serialized PHP
        let parsed;
        if (rawMeta.startsWith('{') || rawMeta.startsWith('[')) {
          parsed = JSON.parse(rawMeta);
        } else {
          parsed = phpUnserialize(rawMeta);
        }

        if (parsed?.fields) {
          fields = (Array.isArray(parsed.fields) ? parsed.fields : Object.values(parsed.fields))
            .map(normalizeField);
        }
      } catch (err) {
        console.warn(`  Warning: Could not parse form ${formId} meta: ${err.message}`);
      }
    }

    forms.push({
      id: parseInt(formId),
      title: form.title || `Form ${formId}`,
      date_created: form.date_created,
      fields,
    });
  }

  console.log(`  Forms: ${forms.length} (${forms.reduce((s, f) => s + f.fields.length, 0)} fields)`);
  return { files: [], data: { forms } };
}

function normalizeField(field) {
  const normalized = {
    id: field.id,
    type: mapFieldType(field.type),
    label: field.label || '',
    required: field.isRequired === '1' || field.isRequired === true,
    placeholder: field.placeholder || '',
  };

  // Choices (for select, radio, checkbox)
  if (field.choices) {
    const choices = Array.isArray(field.choices) ? field.choices : Object.values(field.choices);
    normalized.choices = choices.map(c => ({
      text: c.text || c.value || '',
      value: c.value || c.text || '',
    }));
  }

  // Sub-fields (for name, address compound fields)
  if (field.inputs) {
    const inputs = Array.isArray(field.inputs) ? field.inputs : Object.values(field.inputs);
    normalized.inputs = inputs.map(i => ({
      id: i.id,
      label: i.label || '',
    }));
  }

  if (field.maxLength) normalized.maxLength = parseInt(field.maxLength);
  if (field.cssClass) normalized.cssClass = field.cssClass;

  return normalized;
}

function mapFieldType(gfType) {
  const map = {
    text: 'text',
    textarea: 'textarea',
    select: 'select',
    multiselect: 'select',
    radio: 'radio',
    checkbox: 'checkbox',
    name: 'name',
    email: 'email',
    phone: 'tel',
    number: 'number',
    date: 'date',
    time: 'time',
    address: 'address',
    website: 'url',
    fileupload: 'file',
    hidden: 'hidden',
    html: 'html',
    section: 'section',
    page: 'page',
    consent: 'checkbox',
  };
  return map[gfType] || gfType || 'text';
}
