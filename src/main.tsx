import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import Room from "./pages/Room";
import Projects from "./pages/Projects";
import "./index.css";

// A few pages, no router: vercel.json rewrites everything to index.html.
const page = () => {
  const path = window.location.pathname.replace(/\/+$/, "");
  let name = "Home";
  let el = <Home />;
  if (path === "/watch") { name = "Watch"; el = <Watch />; }
  if (path === "/room") { name = "Room"; el = <Room />; }
  if (path === "/projects") { name = "Projects"; el = <Projects />; }
  document.title = `Bot Talk | ${name}`;
  return el;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page()}
  </React.StrictMode>,
);
