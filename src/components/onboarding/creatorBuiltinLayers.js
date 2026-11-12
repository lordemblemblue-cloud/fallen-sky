// Built-in layer options that ship with a body rather than the catalog.
// Fused bodies bundle their hair and tattoo layers, so the picker stays empty
// until those manifests are published.
export function useBuiltinLayers() {
  return { hair: [], tattoo: [], outfit: [] };
}

export default useBuiltinLayers;