/** Firefox's browser namespace provides promises; Chrome MV3 is the fallback. */
export function extensionApi(): typeof chrome {
  const scope = globalThis as typeof globalThis & { browser?: typeof chrome };
  return scope.browser ?? scope.chrome;
}
