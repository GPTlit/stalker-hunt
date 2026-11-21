import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mountain View Campus · Horror Map" },
      { name: "description", content: "Explore a 3D Mountain View campus map built for horror: night, dusk and day, flashlight, walk and orbit cameras, and a minimap." },
      { property: "og:title", content: "Mountain View Campus · Horror Map" },
      { property: "og:description", content: "Explorable 3D campus map for horror exploration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/map/index.html"
      title="Mountain View Campus Horror Map"
      className="fixed inset-0 h-screen w-screen border-0 bg-background"
      allow="fullscreen; autoplay"
    />
  );
}
