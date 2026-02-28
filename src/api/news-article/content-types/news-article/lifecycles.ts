const MAX_SUMMARY_LENGTH = 170;

function stripHtml(value: string) {
  return String(value ?? "")
    .replace(/<\/?(p|div|br|h[1-6]|li|ul|ol|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstParagraph(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const plain = stripHtml(source);
  return plain.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) ?? "";
}

function truncate(value: string, maxLength: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function applySummary(data: Record<string, any>) {
  const existing = String(data.summary ?? "").trim();
  if (existing) return;
  const fromContent = truncate(firstParagraph(data.content), MAX_SUMMARY_LENGTH);
  if (fromContent) {
    data.summary = fromContent;
  }
}

export default {
  beforeCreate(event: any) {
    applySummary(event.params.data ?? {});
  },
  beforeUpdate(event: any) {
    applySummary(event.params.data ?? {});
  },
};
