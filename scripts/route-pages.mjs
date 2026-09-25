// After vite build: write dist/<route>/index.html for each page in
// src/route-meta.json, with that page's title, description, and canonical in
// the HTML itself. Crawlers and link previews that run no JavaScript then see
// the right tags instead of the home page's.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = "https://bottalk.me";
const shell = readFileSync("dist/index.html", "utf8");
const pages = JSON.parse(readFileSync("src/route-meta.json", "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Swap the content/href of one tag, found by an attribute like name="description".
const setAttr = (html, match, attr, value) =>
  html.replace(new RegExp(`<(meta|link)\\s[^>]*${match}[^>]*>`, "s"), (tag) =>
    tag.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${esc(value)}"`),
  );

for (const { path, title, description } of Object.values(pages)) {
  if (path === "/") continue; // home is dist/index.html already
  const url = ORIGIN + path;
  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = setAttr(html, 'name="description"', "content", description);
  html = setAttr(html, 'rel="canonical"', "href", url);
  html = setAttr(html, 'property="og:title"', "content", title);
  html = setAttr(html, 'property="og:description"', "content", description);
  html = setAttr(html, 'property="og:url"', "content", url);
  html = setAttr(html, 'name="twitter:title"', "content", title);
  html = setAttr(html, 'name="twitter:description"', "content", description);
  mkdirSync(`dist${path}`, { recursive: true });
  writeFileSync(`dist${path}/index.html`, html);
  console.log(`route page: ${path}`);
}
