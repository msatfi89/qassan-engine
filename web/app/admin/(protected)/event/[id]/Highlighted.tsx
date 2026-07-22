/**
 * Renders the announcement text with every extracted place name marked.
 *
 * This is the whole point of the comparison view: the raw text is the truth,
 * so the question is not "do the parsed fields look plausible" but "is every
 * place in this text accounted for, and does every marked name really appear".
 * Green means the name resolved to a registry place; amber means the extractor
 * found it but the registry does not know it yet.
 *
 * Matching is literal substring, deliberately: normalising the text to make
 * more names match would mean showing Med something other than what was
 * published, and the contract says raw text is stored and shown verbatim.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function Highlighted({
  text,
  matched,
  unmatched,
}: {
  text: string;
  matched: string[];
  unmatched: string[];
}) {
  const kind = new Map<string, "ok" | "unknown">();
  for (const n of matched) if (n.trim()) kind.set(n.trim(), "ok");
  for (const n of unmatched) if (n.trim()) kind.set(n.trim(), "unknown");

  const names = [...kind.keys()].sort((a, b) => b.length - a.length); // longest first
  if (names.length === 0) return <>{text}</>;

  const re = new RegExp(`(${names.map(escapeRegex).join("|")})`, "g");
  const parts = text.split(re);

  return (
    <>
      {parts.map((part, i) => {
        const k = kind.get(part);
        if (!k) return <span key={i}>{part}</span>;
        return (
          <mark key={i} className={`hl ${k}`}>
            {part}
          </mark>
        );
      })}
    </>
  );
}
