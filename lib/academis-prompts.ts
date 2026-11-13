export function areAcademisPromptTitlesUnique(
  presets: readonly { categoryId: string; label: string }[],
) {
  const titles = new Set<string>();
  for (const preset of presets) {
    const title = preset.label.trim().toLowerCase();
    const key = `${preset.categoryId}\u0000${title}`;
    if (!title || titles.has(key)) return false;
    titles.add(key);
  }
  return true;
}
