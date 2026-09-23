"use client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GitHubMark, TaktLogo } from "@/components/takt/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/verify", label: "Verify" },
  { href: "/proof", label: "Proof" },
  { href: "/privacy", label: "Privacy" },
  { href: "/limitations", label: "Limitations" },
];

export const REPO_URL = "https://github.com/winsznx/takt";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8 md:h-[88px] min-[1320px]:px-0">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="Takt home" onClick={() => setOpen(false)}>
            <TaktLogo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-base font-medium text-foreground transition-colors hover:text-brand",
                  pathname === item.href && "text-brand",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-4 lg:flex">
          <Link href="/cases" className="text-[15px] font-semibold text-foreground hover:text-brand">
            My cases
          </Link>
          <Button variant="outline" render={<Link href="/cases" />} className="h-9 px-5 text-[15px] font-semibold">
            Try a sample
          </Button>
          <Button render={<Link href="/case/new" />} className="h-9 px-5 text-[15px] font-semibold">
            Check my records
          </Button>
        </div>
        <button
          type="button"
          className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-brand lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t bg-background px-5 pb-6 pt-2 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {[...NAV, { href: "/cases", label: "My cases" }].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b py-4 text-lg font-medium text-foreground last:border-0"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-3">
            <Button size="lg" render={<Link href="/case/new" onClick={() => setOpen(false)} />}>
              Check my records
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/cases" onClick={() => setOpen(false)} />}>
              Try a sample
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/case/new", label: "Check my records" },
      { href: "/cases", label: "Sample cases" },
      { href: "/verify", label: "Verify a packet" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/proof", label: "Proof" },
      { href: "/limitations", label: "Limitations" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: `${REPO_URL}/blob/main/LICENSE`, label: "MIT license" },
      { href: "https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm", label: "Labor Commissioner" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="px-4 pb-4 pt-16 sm:px-6 sm:pb-6 md:pt-24">
      <div className="mx-auto max-w-[1344px] rounded-[28px] bg-navy px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <TaktLogo tone="light" />
            <p className="mt-3 text-[15px] text-white/60">Compare your work records. Build a claim packet anyone can check.</p>
            <a href={REPO_URL} className="mt-6 inline-flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Takt on GitHub">
              <GitHubMark className="size-[18px]" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
            {FOOTER.map((col) => (
              <div key={col.title}>
                <p className="text-[15px] font-semibold">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-[15px] text-white/60 transition-colors hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:justify-between">
          <p>© 2026 Takt. MIT licensed.</p>
          <p>Takt is not legal advice and files nothing for you.</p>
        </div>
      </div>
    </footer>
  );
}
