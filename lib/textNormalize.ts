// Cleans raw extracted text so TTS reads with natural rhythm.
// The #1 cause of "weird mid-sentence pauses" is hard line breaks from PDFs/EPUBs
// being interpreted as pauses. We repair those before sending to the voice engine.

const PARA = "\u2029"; // temporary paragraph marker

export function normalizeText(raw: string): string {
  if (!raw) return "";
  let t = raw.replace(/\r\n?/g, "\n");

  // Strip zero-width + soft hyphen junk that PDFs love to inject.
  t = t.replace(/[\u00ad\u200b\u200c\u200d\uFEFF]/g, "");

  // De-hyphenate words split across a line break: "exam-\nple" -> "example"
  t = t.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");

  // Preserve real paragraph breaks (2+ newlines) before we collapse soft wraps.
  t = t.replace(/\n[ \t]*\n+/g, PARA);

  // Any remaining single newline is a soft wrap inside a sentence -> join with a space.
  t = t.replace(/\n+/g, " ");

  // Restore paragraph breaks.
  t = t.replace(new RegExp(PARA, "g"), "\n\n");

  // Collapse runs of spaces/tabs.
  t = t.replace(/[ \t]{2,}/g, " ");

  // No space *before* punctuation (PDFs often leave "word ,").
  t = t.replace(/[ \t]+([,.;:!?%)\]}])/g, "$1");

  // Ensure a single space *after* sentence punctuation when glued to next word.
  t = t.replace(/([.!?,;:])([A-Za-z0-9])/g, "$1 $2");

  // Normalize fancy quotes/dashes so the engine phrases them well.
  t = t
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2014/g, " - ")   // em dash -> spaced dash (natural pause)
    .replace(/\u2013/g, "-");    // en dash

  // Tidy each line and drop empty lines that snuck in.
  t = t
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

export function wordCount(t: string): number {
  const m = t.trim().match(/\S+/g);
  return m ? m.length : 0;
}

// Rough spoken-length estimate (~150 wpm for audiobook pace).
export function estimateMinutes(t: string): number {
  return wordCount(t) / 150;
}
