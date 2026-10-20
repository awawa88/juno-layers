import { createFileRoute } from "@tanstack/react-router";
import { BodyExplorer } from "@/components/body-explorer";

export const Route = createFileRoute("/earth")({
  component: EarthPage,
});

function EarthPage() {
  return <BodyExplorer bodyId="earth" />;
}
