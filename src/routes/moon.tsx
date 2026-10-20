import { createFileRoute } from "@tanstack/react-router";
import { BodyExplorer } from "@/components/body-explorer";

export const Route = createFileRoute("/moon")({
  component: MoonPage,
});

function MoonPage() {
  return <BodyExplorer bodyId="moon" />;
}
