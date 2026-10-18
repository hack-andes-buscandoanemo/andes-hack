import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { serializeOpenApiDocument } from "./index";

const committedPath = join(import.meta.dirname, "openapi.json");

writeFileSync(committedPath, serializeOpenApiDocument(), "utf-8");
console.log("OpenAPI document generated.");
