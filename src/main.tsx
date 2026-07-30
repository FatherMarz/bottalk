import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import "./index.css";

// Two pages, no router: vercel.json rewrites everything to index.html.
const Page = window.location.pathname.replace(/\/+$/, "") === "/watch" ? Watch : Home;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
