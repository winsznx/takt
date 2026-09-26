import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

const ROWS: [string, string][] = [
  ["Your files", "Stored in this browser's IndexedDB. Takt has no database and no file storage of its own. Clearing your browser data or deleting a case removes them."],
  ["Digital PDFs", "Read on your device with pdf.js. Their contents are not sent anywhere."],
  [
    "Photos, screenshots, and scanned PDFs",
    "On this public demo, photos and scans of your records never leave your browser. You type in what they show. The server refuses to forward any image to an AI service unless its SHA-256 fingerprint matches one of Takt's own synthetic sample images, so this is enforced by code, not only by the page.",
  ],
  [
    "Why the AI is limited to samples",
    "This deployment uses Google's unpaid Gemini API. Google's terms for unpaid use say Google may use what it receives to improve its products, that human reviewers may read it, and: \"Do not submit sensitive, confidential, or personal information to the Unpaid Services.\" Pay stubs and manager messages are exactly that, so Takt only sends its synthetic sample images. A deployment on a paid tier whose terms fit personal records could turn image reading on for real uploads.",
  ],

  ["What you type", "Your name, employer, and answers are stored only in this browser and only written into the packet you choose to build."],
  ["The packet", "Built entirely in your browser. It is not uploaded. You decide who gets it."],
  ["Accounts, cookies, analytics", "None. Takt has no sign-in, sets no tracking cookies, and runs no analytics or session recording."],
  ["Hosting", "Takt runs on Vercel, which keeps standard request logs (such as IP address and page address) but not the contents of what you upload."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[880px] px-5 py-10 sm:py-14 min-[1320px]:px-0">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">Privacy</h1>
      <p className="mt-2 text-muted-foreground">
        You&apos;re trusting Takt with pay records and private messages. This page describes exactly where they go.
      </p>
      <dl className="mt-6 panel divide-y divide-[#ececef] overflow-hidden">
        {ROWS.map(([term, detail]) => (
          <div key={term} className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr]">
            <dt className="font-medium">{term}</dt>
            <dd className="text-sm text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mt-8 text-[20px] font-semibold tracking-[-0.3px]">Deleting your data</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        On <Link href="/cases" className="underline">My cases</Link> you can delete one case or everything Takt stored in this browser. In a private
        window, everything is erased when the window closes. Cases don&apos;t move between devices or browsers.
      </p>
      <h2 className="mt-8 text-[20px] font-semibold tracking-[-0.3px]">Fingerprints</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Before anything reads a file, Takt computes its SHA-256 fingerprint. The fingerprint goes into your packet so anyone can later confirm that a file
        you show them is the same one the packet was built from. A fingerprint does not reveal the file&apos;s contents.
      </p>
    </div>
  );
}
