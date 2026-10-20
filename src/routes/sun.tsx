import { createFileRoute } from "@tanstack/react-router";
import { BodyExplorer } from "@/components/body-explorer";

export const Route = createFileRoute("/sun")({
  component: SunPage,
});

function SunPage() {
  return <BodyExplorer bodyId="sun" />;
}
