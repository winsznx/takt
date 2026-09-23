"use client";
import { useRouter } from "next/navigation";
import { ScopeForm } from "@/components/takt/scope-form";
import { createCase } from "@/lib/client/cases";

export default function NewCasePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[720px] px-5 py-10 sm:py-14 min-[1320px]:px-0">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">Start a private case</h1>
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
