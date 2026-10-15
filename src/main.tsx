import React from "react";
import ReactDOM from "react-dom/client";
import RoomApp from "./components/RoomApp";
import Approval from "./pages/Approval";
import "./index.css";
import routeMeta from "./route-meta.json";
const path = location.pathname.replace(/\/+$/, "") || "/";
const meta =
  Object.values(routeMeta).find((meta) => meta.path === path) || routeMeta.Home;
document.title = meta.title;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", meta.description);
document
  .querySelector('link[rel="canonical"]')
  ?.setAttribute("href", `${location.origin}${meta.path}`);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {path === "/approval" ? (
      <Approval />
    ) : (
      <RoomApp key={path} demo={path === "/demo"} room={path === "/room"} />
    )}
  </React.StrictMode>,
);
