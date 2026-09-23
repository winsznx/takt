import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter, SiteHeader } from "@/components/takt/site-chrome";
import "./globals.css";

const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Takt: find where your hours changed", template: "%s · Takt" },
  description:
    "Compare your schedule, time records, pay stubs, and messages. Review every source, see where they disagree, and build a California wage-claim evidence packet.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fcfcfc" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
