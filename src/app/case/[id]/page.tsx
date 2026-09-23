import { redirect } from "next/navigation";

export default async function CaseIndex({ params }: PageProps<"/case/[id]">) {
  const { id } = await params;
  redirect(`/case/${id}/evidence`);
}
