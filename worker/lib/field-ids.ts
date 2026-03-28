export function normalizeToFieldId(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50) || "field"
  );
}

export function getUniqueFieldId(
  label: string,
  existingIds: Iterable<string>,
  currentId?: string,
): string {
  const baseId = normalizeToFieldId(label);
  const usedIds = new Set(existingIds);

  if (currentId) {
    usedIds.delete(currentId);
  }

  let nextId = baseId;
  let counter = 2;

  while (usedIds.has(nextId)) {
    nextId = `${baseId}_${counter}`;
    counter++;
  }

  return nextId;
}
