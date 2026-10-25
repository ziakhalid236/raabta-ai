export const DEFAULT_PROVIDER_BASE_URL = "";

export function normalizeProviderBaseUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}`;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

export function sameProviderEndpoint(left: string, right: string): boolean {
  return /^https:\/\//i.test(left.trim()) &&
    /^https:\/\//i.test(right.trim()) &&
    normalizeProviderBaseUrl(left) === normalizeProviderBaseUrl(right);
}
