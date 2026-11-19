// The preview has no Base44 session. The player clip library asks for admin AnimationFBX rows and gets none;
// everything else it plays comes from the GLBs and the montage/clip-pack files under public/.
const empty = async () => [];
export const base44 = {
  entities: new Proxy({}, { get: () => ({ filter: empty, list: empty, get: async () => null }) }),
  auth: { me: async () => null, isAuthenticated: async () => false },
  integrations: {},
  functions: { invoke: async () => ({}) },
};
export default base44;
