// Keep generic link labels out of saved and displayed role titles.
export function isBoardActionLabel(value: string) {
  return /^(?:apply(?: now| here| for (?:this |the )?(?:job|role|position))?|view (?:job|role|position|details|job details)|(?:learn|read) more|details)[.!\s]*$/i.test(value.trim());
}

export function boardListingTitle(title: string | undefined, url: string) {
  const saved = title?.replace(/\s+/g, " ").trim();
  if (saved && !isBoardActionLabel(saved)) return saved;
  try {
    const link = new URL(url);
    if (link.protocol !== "https:" || !link.hostname.endsWith(".myworkdayjobs.com") || !link.pathname.includes("/job/")) return "";
    const slug = decodeURIComponent(link.pathname.replace(/\/$/, "").split("/").at(-1) || "");
    const match = /^(.+)_(?:JR|R-?)\d+$/i.exec(slug);
    const recovered = match?.[1].replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "";
    return recovered && !isBoardActionLabel(recovered) ? recovered.slice(0, 300) : "";
  } catch { return ""; }
}
