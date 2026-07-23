// Splits text into TTS-sized pieces that ALWAYS end at a sentence (or paragraph)
// boundary. Because each seam lands where a natural pause already exists, the
// stitched audio has no audible gap in the middle of a sentence.

function splitSentences(paragraph: string): string[] {
  // Keep the terminator with its sentence. Handles trailing quotes/brackets.
  const re = /[^.!?\n]+(?:[.!?]+["'\)\]]*|$)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out.length ? out : [paragraph.trim()];
}

// Hard-split a single sentence that is longer than maxLen (rare) at a comma/space.
function hardSplit(sentence: string, maxLen: number): string[] {
  const pieces: string[] = [];
  let s = sentence;
  while (s.length > maxLen) {
    let cut = s.lastIndexOf(", ", maxLen);
    if (cut < maxLen * 0.5) cut = s.lastIndexOf(" ", maxLen);
    if (cut <= 0) cut = maxLen;
    pieces.push(s.slice(0, cut + 1).trim());
    s = s.slice(cut + 1).trim();
  }
  if (s) pieces.push(s);
  return pieces;
}

export function chunkText(text: string, maxLen = 3500): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of paragraphs) {
    for (const sentence of splitSentences(para)) {
      const parts = sentence.length > maxLen ? hardSplit(sentence, maxLen) : [sentence];
      for (const part of parts) {
        if ((current + " " + part).trim().length > maxLen) flush();
        current = current ? current + " " + part : part;
      }
    }
    // Prefer breaking at paragraph ends -> nicer prosody between sections.
    if (current.length > maxLen * 0.6) flush();
  }
  flush();
  return chunks;
}
