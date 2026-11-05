/**
 * Turns Vite's single-file build into an Artifact page.
 *
 * The Artifact host wraps the page in its own <!doctype>/<head>/<body>, so the
 * page is written as body content: title and metas first, then the font link,
 * styles, the root element and the inlined app script.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? "<title>Stock Report</title>";
const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g).map((s) => s.replace(/ crossorigin/g, ""));
if (!scripts.length) throw new Error("No inlined script found in dist/index.html");

const page = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  ...fonts,
  ...styles,
  '<div id="root"></div>',
  ...scripts,
].join("\n");

mkdirSync("artifact", { recursive: true });
writeFileSync("artifact/stock-report.html", page);
console.log(`artifact/stock-report.html  ${(page.length / 1024).toFixed(0)} KB`);
