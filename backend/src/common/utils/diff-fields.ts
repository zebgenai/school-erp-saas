export function computeChangedFields(
  oldValue: Record<string, unknown> | null | undefined,
  newValue: Record<string, unknown> | null | undefined,
): string[] {
  if (!oldValue || !newValue) return [];
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
      changed.push(key);
    }
  }
  return changed;
}
