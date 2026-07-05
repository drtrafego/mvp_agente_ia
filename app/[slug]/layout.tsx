import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { AppShell } from "@/components/sidebar";

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  return (
    <AppShell slug={agent.slug} name={agent.name} persona={agent.persona}>
      {children}
    </AppShell>
  );
}
