export function publicAssetUrl(path: string, baseUrl: string): string {
  return new URL(path.replace(/^\/+/, ''), baseUrl).href
}
