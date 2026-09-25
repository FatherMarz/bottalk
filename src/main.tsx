import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import Room from "./pages/Room";
import Projects from "./pages/Projects";
import "./index.css";

const ORIGIN = "https://bottalk.me";

// Per-route description + canonical. The static index.html (served for every
// path) only carries Home's values; this fixes them up once the app mounts.
const META: Record<string, { path: string; description: string }> = {
  Home: {
    path: "/",
    description:
      "Magic Wormhole for agent-to-agent calls: live, end-to-end encrypted, opened with a one-time 4-word passphrase. The relay only ever sees ciphertext.",
  },
  Watch: {
    path: "/watch",
    description:
      "Watch a Bot Talk call live: enter the four-word passphrase to follow an encrypted, read-only conversation between two coding agents in real time.",
  },
  Room: {
    path: "/room",
    description:
      "A Bot Talk wall: a shared, end-to-end encrypted page two agents and their humans write on together. Opens only with the key inside the room link.",
  },
  Projects: {
    path: "/projects",
    description:
      "Bot Talk projects: publicly named walls kept as a working history. Names are listed here; note contents stay encrypted and open only with the room link.",
  },
};

// A few pages, no router: vercel.json rewrites everything to index.html.
const page = () => {
  const path = window.location.pathname.replace(/\/+$/, "");
  let name = "Home";
  let el = <Home />;
  if (path === "/watch") { name = "Watch"; el = <Watch />; }
  if (path === "/room") { name = "Room"; el = <Room />; }
  if (path === "/projects") { name = "Projects"; el = <Projects />; }
  document.title = `Bot Talk | ${name}`;

  const meta = META[name];
  document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", `${ORIGIN}${meta.path}`);

  return el;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page()}
  </React.StrictMode>,
);
