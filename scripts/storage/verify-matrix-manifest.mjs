import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const backend = process.argv[2];
if (backend !== "postgres") {
  throw new Error(`Unsupported storage backend: ${backend ?? "missing"}`);
}

const workflowUrl = new URL(
  "../../.github/workflows/database.yml",
  import.meta.url,
);
const workflow = readFileSync(fileURLToPath(workflowUrl), "utf8");
const languages = [
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "csharp",
  "swift",
  "ruby",
  "php",
];

const requiredPatterns = [
  [/permissions:\s*\n\s+contents: read/, "read-only workflow permissions"],
  [/image: postgres:18\.6-alpine/, "pinned PostgreSQL 18.6 service"],
  [/persist-credentials: false/, "disabled persisted checkout credentials"],
  [/fail-fast: false/, "non-cancelling language matrix"],
  [/name: PostgreSQL storage/, "stable PostgreSQL aggregate check"],
  [
    /needs:\s*\n\s+- postgres-storage/,
    "aggregate dependency on the language matrix",
  ],
];

for (const [pattern, description] of requiredPatterns) {
  if (!pattern.test(workflow)) throw new Error(`Missing ${description}`);
}
for (const language of languages) {
  if (!new RegExp(`language: ${language}(?:\\s|$)`).test(workflow)) {
    throw new Error(`Missing PostgreSQL language matrix entry: ${language}`);
  }
}

console.log(
  `Validated PostgreSQL storage matrix for ${languages.length} languages.`,
);
