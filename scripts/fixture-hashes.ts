/**
 * Writes src/lib/ai/synthetic-allowlist.json: SHA-256 of every synthetic
 * fixture image. In synthetic-only mode the extraction route forwards an image
 * to the model only if its hash is on this list.
 *
 *   npx tsx scripts/fixture-hashes.ts
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export async function fixtureImageHashes(): Promise<string[]> {
  const hashes: string[] = [];
  for (const caseId of (await readdir(path.join(ROOT, "fixtures"))).sort()) {
    const dir = path.join(ROOT, "fixtures", caseId, "documents");
    for (const file of (await readdir(dir).catch(() => [])).sort()) {
      if (!/\.(png|jpe?g)$/i.test(file)) continue;
      hashes.push(createHash("sha256").update(await readFile(path.join(dir, file))).digest("hex"));
    }
  }
  return [...new Set(hashes)].sort();
}

if (process.argv[1]?.endsWith("fixture-hashes.ts")) {
  const hashes = await fixtureImageHashes();
  await writeFile(path.join(ROOT, "src/lib/ai/synthetic-allowlist.json"), `${JSON.stringify(hashes, null, 2)}\n`);
  console.log(`${hashes.length} synthetic image hashes written`);
}
