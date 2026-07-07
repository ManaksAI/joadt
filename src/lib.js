// Pure helpers for the control-plane view — kept out of components so they're testable
// without a DOM (vitest runs in the `node` environment).

export function gripStatus(t) {
  if (t.operable) return "operable";
  return t.grip === "none" ? "no grip" : "needs prep";
}

export function summarize(registry) {
  return {
    total: registry.length,
    operable: registry.filter((t) => t.operable).length,
    openLatches: registry.reduce((n, t) => n + (t.open_latches || 0), 0),
  };
}
