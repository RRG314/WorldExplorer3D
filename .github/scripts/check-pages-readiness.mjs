import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const mustExist = [".nojekyll", "index.html", "js/bootstrap.js", "js/app-entry.js"];

const errors = [];

for (const rel of mustExist) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`Missing required file for Pages deploy: ${rel}`);
  }
}

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function collectLocalRefs(sourceText) {
  const refs = [];
  for (const m of sourceText.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.push(m[1]);
  for (const m of sourceText.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) refs.push(m[2]);
  return refs.filter((ref) => {
    return !/^(?:https?:|data:|mailto:|#|javascript:)/i.test(ref);
  });
}

const indexHtml = readText("index.html");
const stylesCss = fs.existsSync(path.join(repoRoot, "styles.css")) ? readText("styles.css") : "";

const absolutePathPatterns = [
  { label: 'src="/..."', regex: /src=["']\//g },
  { label: 'href="/..."', regex: /href=["']\//g },
  { label: "url('/...')", regex: /url\((["'])\//g },
];

for (const pattern of absolutePathPatterns) {
  if (pattern.regex.test(indexHtml) || pattern.regex.test(stylesCss)) {
    errors.push(
      `Found Pages-unsafe absolute path pattern (${pattern.label}). Use relative paths for project Pages URLs.`
    );
  }
}

const allRefs = new Set([
  ...collectLocalRefs(indexHtml),
  ...collectLocalRefs(stylesCss),
]);

for (const ref of allRefs) {
  const clean = ref.split("?")[0].split("#")[0];
  if (!clean || clean === "/") continue;
  const abs = path.join(repoRoot, clean);
  if (!fs.existsSync(abs)) {
    errors.push(`Missing local asset reference: ${clean}`);
  }
}

if (errors.length > 0) {
  console.error("Pages readiness check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Pages readiness check passed.");
