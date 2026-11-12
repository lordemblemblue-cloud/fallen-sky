// Catalog of creator layers. Empty until the customization catalog is connected;
// the caller only reads canManage to decide whether to offer the import tool.
export function useCustomizationCatalog() {
  return {
    loading: false,
    error: null,
    data: { canManage: false, shapes: [], hair: [], tattoo: [], outfit: [] },
  };
}

export default useCustomizationCatalog;