import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract/route";
import { loadDocument } from "../helpers/fixtures";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(p)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe("privacy acceptance", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the extraction route refuses without a key and logs nothing from the document", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const logs: unknown[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a) => logs.push(a));
    const form = new FormData();
    form.append("file", new Blob([(await loadDocument("TAKT-DEMO-001", "IMG_4821.png")).slice()], { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control") ?? "no-store").toContain("no-store");
    expect(JSON.stringify(logs)).not.toMatch(/flour|7:40|Dana/);
    vi.unstubAllEnvs();
  });

  it("the extraction route rejects non-images by content, not by filename", async () => {
    const form = new FormData();
    form.append("file", new Blob([new TextEncoder().encode("%PDF-1.7 not an image")], { type: "image/png" }), "photo.png");
    expect((await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }))).status).toBe(415);
  });

  it("no server code writes files, stores data, or logs request contents", async () => {
    const server = [...(await sourceFiles(path.join(ROOT, "src/app/api"))), path.join(ROOT, "src/lib/ai/gemini.ts")];
    for (const file of server) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/writeFile|createWriteStream|@vercel\/blob|@supabase|localStorage/);
      for (const call of text.matchAll(/console\.\w+\(([^)]*)\)/g)) expect(call[1], file).not.toMatch(/raw|text|bytes|form|file|cause/);
    }
  });

  it("ships no analytics or session replay", async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
    expect(deps).not.toMatch(/analytics|posthog|sentry|segment|hotjar|fullstory|logrocket|mixpanel|amplitude|speed-insights/);
    for (const file of await sourceFiles(path.join(ROOT, "src"))) {
      expect(await readFile(file, "utf8"), file).not.toMatch(/googletagmanager|gtag\(|@vercel\/analytics/);
    }
  });

  it("the Gemini key is never exposed to the browser", async () => {
    for (const file of await sourceFiles(path.join(ROOT, "src"))) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/NEXT_PUBLIC_GEMINI|NEXT_PUBLIC_.*KEY/);
      if (text.includes("GEMINI_API_KEY")) expect(text, file).toContain('import "server-only"');
    }
  });
});
