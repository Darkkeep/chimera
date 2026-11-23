/** Authoring labels are independent of stored file paths and asset references. */
export function assetLabel(asset?: { filename: string; displayName?: string } | null, fallback = "Media") {
  return asset?.displayName?.trim() || asset?.filename || fallback;
}
