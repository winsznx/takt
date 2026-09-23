/**
 * Independent packet verification from the command line.
 *
 *   npm run verify:packet -- path/to/packet.zip [--originals dir]
 *
 * Exits 0 only for VERIFIED_PACKET.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { verifyPacket } from "@/lib/packet/verify";

const ROOT = path.resolve(import.meta.dirname, "..");

async function main() {
  const args = process.argv.slice(2);
  const packetPath = args.find((a) => !a.startsWith("--"));
  if (!packetPath) {
    console.error("usage: npm run verify:packet -- <packet.zip> [--originals <dir>]");
    process.exit(2);
  }
  const originalsIndex = args.indexOf("--originals");
  const originals =
    originalsIndex >= 0
      ? await Promise.all(
          (await readdir(args[originalsIndex + 1])).map(async (f) => new Uint8Array(await readFile(path.join(args[originalsIndex + 1], f)))),
        )
      : undefined;

  const receipt = await verifyPacket(new Uint8Array(await readFile(packetPath)), {
    form55Template: new Uint8Array(await readFile(path.join(ROOT, "legal/ca-dlse/form-55/source.xls"))),
    originals,
  });

  for (const check of receipt.checks) {
    const mark = check.status === "pass" ? "PASS" : check.status === "fail" ? "FAIL" : "SKIP";
    console.log(`${mark}  ${check.id.padEnd(28)} ${check.detail}`);
  }
  console.log(`\n${receipt.status}  case=${receipt.caseId ?? "?"}  manifest=${receipt.manifestSha256 ?? "?"}  verifier=${receipt.verifierVersion}`);
  process.exit(receipt.status === "VERIFIED_PACKET" ? 0 : 1);
}

await main();
