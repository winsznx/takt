"use client";
import { useRouter } from "next/navigation";
import { ScopeForm } from "@/components/takt/scope-form";
import { createCase } from "@/lib/client/cases";

export default function NewCasePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Start a private case</h1>
      <p className="mt-2 text-muted-foreground">
        A few questions first. They decide whether Takt&apos;s California overtime rules fit your job. Your answers and files stay in this
        browser.
      </p>
      <div className="mt-8">
        <ScopeForm
          submitLabel="Continue to my records"
          onSubmit={async (answers) => {
            const id = await createCase(answers);
            router.push(`/case/${id}/evidence`);
          }}
        />
      </div>
    </div>
  );
}
