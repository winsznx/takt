import type { ReactNode } from "react";

export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-[640px]">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">{title}</h1>
        {children && <div className="mt-3 text-[16px] leading-[1.55] text-muted-foreground sm:text-[18px]">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-[-0.3px]">{children}</h2>
      {hint && <p className="mt-1 text-[15px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageContainer({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto px-5 py-10 sm:py-14 ${wide ? "max-w-[1180px]" : "max-w-[880px]"} min-[1320px]:px-0`}>{children}</div>;
}
