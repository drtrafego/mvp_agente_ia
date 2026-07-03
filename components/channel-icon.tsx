import {
  MessageCircle,
  Webhook,
  Server,
  Terminal,
  HelpCircle,
} from "lucide-react";

export function ChannelIcon({
  channel,
  className = "size-3.5",
}: {
  channel: string | null;
  className?: string;
}) {
  switch (channel) {
    case "whatsapp":
    case "whatsapp_cloud":
      return <MessageCircle className={className} />;
    case "webhook":
      return <Webhook className={className} />;
    case "api_server":
      return <Server className={className} />;
    case "cli":
      return <Terminal className={className} />;
    default:
      return <HelpCircle className={className} />;
  }
}
