export interface TagOption {
  id: string;
  name: string;
}

// Returns the next step config after a tag is picked in an add_tag/remove_tag
// step. Both tagId and tagName are written into a single object so a plain
// setState (which replaces rather than merges) can't drop one of them.
export function applyTagSelection(
  config: Record<string, unknown>,
  tagId: string,
  tags: TagOption[],
): Record<string, unknown> {
  const tag = tags.find((t) => t.id === tagId);
  return tag
    ? { ...config, tagId, tagName: tag.name }
    : { ...config, tagId };
}
