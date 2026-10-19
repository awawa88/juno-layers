import { createFileRoute } from "@tanstack/react-router";
import { JupiterExplorer } from "@/components/jupiter-explorer";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <JupiterExplorer />;
}
