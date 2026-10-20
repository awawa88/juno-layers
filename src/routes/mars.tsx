import { createFileRoute } from "@tanstack/react-router";
import { BodyExplorer } from "@/components/body-explorer";

export const Route = createFileRoute("/mars")({
  component: MarsPage,
});

function MarsPage() {
  return <BodyExplorer bodyId="mars" />;
}
