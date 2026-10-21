import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { scanForbiddenImports } from "./scan.mts";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "neton-scan-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

test("follows relative and alias imports and reports request-identity access", () => {
  const root = fixture({
    "public/page.tsx": `import { helper } from "../lib/helper";\nimport x from "@/site/thing";\nexport default helper;`,
    "lib/helper.ts": `import { cookies } from "next/headers";\nexport const helper = 1;`,
    "src/site/thing.ts": `import { getMemberProfile } from "@neton/application-client-runtime/server";\nexport default getMemberProfile;`,
  });
  const found = scanForbiddenImports([path.join(root, "public/page.tsx")], { aliasRoot: path.join(root, "src") });
  assert.deepEqual(found.map((f) => `${path.relative(root, f.file)}:${f.line}`).sort(), ["lib/helper.ts:1", "src/site/thing.ts:1"]);
});

test("stops at client boundaries and ignores comments", () => {
  const root = fixture({
    "public/page.tsx": `// 不要在这里调 cookies() 或 apiFetch(…)\n/* connection() */\nimport { Island } from "./island";\nexport default Island;`,
    "public/island.tsx": `"use client";\nimport { apiFetch } from "@neton/application-client-runtime/client";\nexport const Island = () => apiFetch("/x");`,
  });
  assert.deepEqual(scanForbiddenImports([path.join(root, "public/page.tsx")]), []);
});

test("flags apiFetch and connection() in server code", () => {
  const root = fixture({ "cards/card.tsx": `import { connection } from "next/server";\nexport default async function C() { await connection(); return apiFetch("/x"); }` });
  const rules = scanForbiddenImports([path.join(root, "cards/card.tsx")]).map((f) => f.rule);
  assert.ok(rules.some((r) => r.startsWith("connection()")));
  assert.ok(rules.some((r) => r.startsWith("apiFetch")));
});
