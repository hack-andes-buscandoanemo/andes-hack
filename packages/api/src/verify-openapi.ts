import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createOpenApiDocument, serializeOpenApiDocument } from "./index";

const committedPath = join(import.meta.dirname, "openapi.json");

export function verifyOpenApiDocument(options?: {
  committedDocument?: unknown;
  regeneratedDocument?: unknown;
}) {
  const committed = options?.committedDocument ?? JSON.parse(readFileSync(committedPath, "utf-8"));
  const regenerated = options?.regeneratedDocument ?? createOpenApiDocument();

  if (serializeOpenApiDocument(committed) !== serializeOpenApiDocument(regenerated)) {
    return {
      ok: false as const,
      message: "OpenAPI document drift detected. Regenerate the committed spec.",
    };
  }

  return {
    ok: true as const,
    message: "OpenAPI document is up to date.",
  };
}

if (import.meta.main) {
  const result = verifyOpenApiDocument();
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(result.message);
}
