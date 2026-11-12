// Build flag for owner-only authoring tools (blueprint library, live tuning).
// The imported build shipped this as a development-release flag; normal builds
// keep those tools admin-only (see ChronicleBlueprintLibrary's role check).
export const isDeveloperVersion = false;