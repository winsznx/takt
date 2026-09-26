/**
 * Checks every local link in tracked Markdown and every
 * github.com/winsznx/takt/blob|tree/main/<path> link anywhere in tracked text,
 * against the files that exist in the working tree. Exits 1 on any broken link.
 *
 *   npx tsx scripts/check-links.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const textFiles = tracked.filter((f) => /\.(md|tsx?|json)$/.test(f) && !f.startsWith("fixtures/") && f !== "package-lock.json");
const broken: string[] = [];

const anchorOk = (file: string, anchor: string) => {
  const slugs = readFileSync(path.join(ROOT, file), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("#"))
    .map((l) => l.replace(/^#+\s*/, "").trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-"));
  return slugs.includes(anchor);
};

for (const file of textFiles) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  if (file.endsWith(".md")) {
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [p, anchor] = target.split("#");
      const resolved = p ? path.normalize(path.join(path.dirname(file), p)) : file;
      if (!existsSync(path.join(ROOT, resolved))) broken.push(`${file}: ${target} (missing ${resolved})`);
      else if (anchor && resolved.endsWith(".md") && !anchorOk(resolved, anchor)) broken.push(`${file}: ${target} (no heading #${anchor})`);
    }
  }
  for (const m of text.matchAll(/github\.com\/winsznx\/takt\/(?:blob|tree)\/main\/([^\s"'`)<>]+)/g)) {
    const p = m[1].replace(/[.,]$/, "");
    if (!tracked.some((t) => t === p || t.startsWith(`${p}/`))) broken.push(`${file}: github link to ${p} (not tracked)`);
  }
  for (const m of text.matchAll(/`?\$\{REPO\}\/([^`}"]+)`?/g)) {
    const p = m[1];
    if (!tracked.some((t) => t === p || t.startsWith(`${p}/`))) broken.push(`${file}: REPO link to ${p} (not tracked)`);
  }
}

if (broken.length) {
  console.error(broken.join("\n"));
  process.exit(1);
}
console.log(`links ok across ${textFiles.length} tracked files`);
