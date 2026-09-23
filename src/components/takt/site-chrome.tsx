import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Takt
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/#how" className="hidden text-muted-foreground hover:text-foreground sm:inline">
            How it works
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link href="/verify" className="hidden text-muted-foreground hover:text-foreground sm:inline">
            Verify
          </Link>
          <Link href="/cases" className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
            My cases
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 sm:flex-row sm:justify-between">
        <p>Takt is not a law firm and does not give legal advice. It does not file anything for you.</p>
        <nav className="flex gap-4">
          <Link href="/limitations" className="hover:text-foreground">Limitations</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/proof" className="hover:text-foreground">Proof</Link>
        </nav>
      </div>
    </footer>
  );
}
