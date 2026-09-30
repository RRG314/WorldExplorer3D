// r128 predates KHR_materials_emissive_strength. Translate its scalar into the
// existing Standard/Physical material property without changing the artwork.
export function registerMaterialCompatibility(loader) {
  loader.register(parser => ({
    name: 'KHR_materials_emissive_strength',
    extendMaterialParams(index, params) {
      const strength = parser.json.materials?.[index]?.extensions
        ?.KHR_materials_emissive_strength?.emissiveStrength;
      if (Number.isFinite(strength) && strength >= 0) params.emissiveIntensity = strength;
      return Promise.resolve();
    }
  }));
  return loader;
}
