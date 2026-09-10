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
  if (path === "/watch") return <Watch />;
  if (path === "/room") return <Room />;
  if (path === "/projects") return <Projects />;
  return <Home />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page()}
  </React.StrictMode>,
);
