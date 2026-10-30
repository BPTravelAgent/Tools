/**
 * Safely computes the base directory URL of the currently loaded application.
 * Ensures relative assets (fonts, workers, sample pdfs) resolve properly whether
 * hosted at domain root, subpath (e.g. GitHub Pages /Tools/PDF/dist/), or local dev server.
 */
export function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const pathname = window.location.pathname;
    const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    return `${window.location.origin}${dir}`;
  }
  return './';
}

/**
 * Returns an absolute URL pointing to an asset inside the app's base directory.
 */
export function getAssetUrl(relPath: string): string {
  const clean = relPath.startsWith('/') ? relPath.substring(1) : relPath;
  return `${getBaseUrl()}${clean}`;
}

