// prebuild: the CLI and skill ship as static assets on the same domain, so
// install.sh can curl them and Vercel serves them before the SPA rewrite.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("client/bottalk.mjs", "public/bottalk.mjs");
copyFileSync("skill/SKILL.md", "public/SKILL.md");
console.log("synced client + skill into public/");
