export function presetFieldGroup(id, label, fields, options = {}) {
  return {
    id,
    label,
    fields,
    collapsible: options.collapsible === true
  };
}
