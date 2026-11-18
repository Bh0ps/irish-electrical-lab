/** Registry model paths are shared by the Blender tools and both app targets. */
export function publicAssetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `${base}${path.replace(/^\/+/, '')}`;
}
