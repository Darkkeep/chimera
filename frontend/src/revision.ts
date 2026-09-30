export function storyboardWriteHeaders(revision: number, json = true): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "If-Match": `"${revision}"`,
  };
}

export function revisionConflictMessage(responseStatus: number): string | null {
  return responseStatus === 412
    ? "This storyboard changed after it was opened. Your draft is still here; reload the project before saving again."
    : null;
}
