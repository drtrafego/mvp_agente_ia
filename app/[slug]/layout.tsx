import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { Sidebar, Topbar } from "@/components/sidebar";

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
    <div className="min-h-dvh">
      <Sidebar slug={agent.slug} name={agent.name} persona={agent.persona} />
      <Topbar slug={agent.slug} name={agent.name} persona={agent.persona} />
      <div className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
