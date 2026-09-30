export function parseLocations(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[;\n]+/).map((part) => part.trim()).filter((part) => {
    if (!part || seen.has(part.toLocaleLowerCase())) return false;
    seen.add(part.toLocaleLowerCase());
    return true;
  });
}

export function serializeLocations(locations: string[]): string {
  return parseLocations(locations.join("; ")).join("; ").slice(0, 500);
}
