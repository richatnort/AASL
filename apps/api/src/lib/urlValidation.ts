import { isIP } from 'net';

/** Returns true if the hostname resolves to a private / loopback / link-local address. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
}

/**
 * Throws an Error if the URL is invalid, uses a non-http(s) protocol,
 * or resolves to a private/internal address (SSRF guard).
 */
export function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('URL resolves to a private or internal address');
  }
}
