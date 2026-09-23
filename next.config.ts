import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

function commit(): string {
  const provided = process.env.TAKT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (provided) return provided.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_TAKT_VERSION: pkg.version, NEXT_PUBLIC_TAKT_COMMIT: commit() },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
