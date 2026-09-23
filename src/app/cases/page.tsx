"use client";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/client/db";
import { deleteAllCases, deleteCase } from "@/lib/client/cases";
import { loadSampleIndex, startSample, type SampleCase } from "@/lib/client/samples";

export default function CasesPage() {
  const router = useRouter();
  const cases = useLiveQuery(() => db.cases.orderBy("updatedAt").reverse().toArray(), []);
  const [samples, setSamples] = useState<SampleCase[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    loadSampleIndex().then(setSamples, () => setSamples([]));
  }, []);

  return (
    <div className="mx-auto max-w-[880px] space-y-12 px-5 py-10 sm:py-14 min-[1320px]:px-0">
      <section>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">Cases on this device</h1>
          <Button render={<Link href="/case/new" />}>New case</Button>
        </div>
        {cases === undefined ? (
          <p className="mt-4 text-muted-foreground">Loading…</p>
        ) : cases.length === 0 ? (
          <p className="mt-4 text-muted-foreground">No cases yet. Start one, or open a sample below to see how Takt works.</p>
        ) : (
          <ul className="mt-4 panel divide-y divide-[#ececef] overflow-hidden">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/case/${c.id}/evidence`} className="min-w-0">
                  <p className="font-medium">
                    {c.reference}
                    {c.sample ? <span className="ml-2 text-xs text-muted-foreground">synthetic sample</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {c.documents.length} files · updated {new Date(c.updatedAt).toLocaleString()}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${c.reference} and its files from this device? This can't be undone.`)) return;
                    await deleteCase(c.id);
                    toast.success("Case deleted from this device");
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        {cases && cases.length > 0 && (
          <Button
            variant="link"
            className="mt-2 px-0 text-destructive"
            onClick={async () => {
              if (!window.confirm("Delete every case and file Takt stored in this browser?")) return;
              await deleteAllCases();
              toast.success("All Takt data deleted from this device");
            }}
          >
            Delete everything Takt stored here
          </Button>
        )}
      </section>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Sample cases</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These use invented people, businesses, and records made for testing. They run through the same steps as your own files.
        </p>
        <ul className="mt-4 space-y-3">
          {samples.map((s) => (
            <li key={s.caseId} className="panel p-5">
              <p className="font-medium">{s.caseId}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={starting !== null}
                onClick={async () => {
                  setStarting(s.caseId);
                  try {
                    router.push(`/case/${await startSample(s)}/evidence`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not open the sample.");
                    setStarting(null);
                  }
                }}
              >
                {starting === s.caseId ? "Opening…" : "Open this sample"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
