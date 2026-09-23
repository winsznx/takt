import { cn } from "@/lib/utils";

/** Takt mark: two offset bars, two records that don't line up. */
export function TaktMark({ className, bars = "#fff" }: { className?: string; bars?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <rect x="5.5" y="7.5" width="13" height="3" rx="1.5" fill={bars} />
      <rect x="8.5" y="13.5" width="10" height="3" rx="1.5" fill={bars} opacity="0.72" />
    </svg>
  );
}

export function TaktLogo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <TaktMark className={"text-brand"} bars="#fff" />
      <span className={cn("text-[22px] font-semibold leading-none tracking-[-0.04em]", tone === "dark" ? "text-ink" : "text-white")}>takt</span>
    </span>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4", className)} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
