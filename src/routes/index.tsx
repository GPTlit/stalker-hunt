import { createFileRoute, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stalker Hunt · 3D Horror Map & Backrooms Co-op" },
      {
        name: "description",
        content:
          "Explore the 3D Mountain View campus and Backrooms Level 0 expansion as Cristiano Ronaldo or Lionel Messi with working horror flashlight and online co-op.",
      },
      { property: "og:title", content: "Stalker Hunt · 3D Horror Map & Backrooms Co-op" },
      {
        property: "og:description",
        content: "Explorable 3D campus and Backrooms horror map with multi-stalker AI and online co-op.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr || "" });
  const iframeSrc = searchStr ? `/map/index.html${searchStr}` : "/map/index.html";

  return (
    <iframe
      src={iframeSrc}
      title="Mountain View Campus Horror Map"
      className="fixed inset-0 h-screen w-screen border-0 bg-background"
      allow="fullscreen; autoplay"
    />
  );
}
