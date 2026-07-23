// Client-side file parsing for .txt, .pdf and .epub.
// Everything runs in the browser so the serverless function only handles audio.

export type ParseResult = { text: string; title: string };

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, "");
  if (name.endsWith(".pdf")) return { text: await parsePdf(file), title };
  if (name.endsWith(".epub")) return { text: await parseEpub(file), title };
  // .txt, .md, and anything else -> treat as plain text.
  return { text: await file.text(), title };
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const parts: string[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) {
        parts.push(line);
        line = "";
      } else if (!item.str.endsWith(" ")) {
        line += " ";
      }
    }
    if (line) parts.push(line);
    pages.push(parts.join("\n"));
  }
  // Blank line between pages so the normalizer treats page joins as paragraphs.
  return pages.join("\n\n");
}

async function parseEpub(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = containerXml?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("Could not read EPUB structure (missing OPF).");
  const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]*$/, "") : "";
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error("Could not read EPUB package file.");

  // Map manifest id -> href.
  const manifest: Record<string, string> = {};
  const itemRe = /<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*>/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(opf)) !== null) manifest[im[1]] = im[2];

  // Reading order from the spine.
  const spine: string[] = [];
  const spineRe = /<itemref\b[^>]*\bidref="([^"]+)"[^>]*>/g;
  let sm: RegExpExecArray | null;
  while ((sm = spineRe.exec(opf)) !== null) spine.push(sm[1]);

  const out: string[] = [];
  for (const idref of spine) {
    const href = manifest[idref];
    if (!href || !/\.x?html?$/i.test(href)) continue;
    const path = (opfDir ? opfDir + "/" : "") + href.split("#")[0];
    const html = await zip.file(decodeURIComponent(path))?.async("string");
    if (html) out.push(htmlToText(html));
  }
  return out.join("\n\n");
}

function htmlToText(html: string): string {
  let s = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  // Decode HTML entities via the browser.
  const ta = document.createElement("textarea");
  ta.innerHTML = s;
  return ta.value;
}
