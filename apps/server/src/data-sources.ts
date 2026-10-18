import { dataSourcesRoute } from "@andes-hack/api";
import { sources } from "@andes-hack/matching";
import { OpenAPIHono } from "@hono/zod-openapi";

// Where every number of the app comes from (US-032). `sources` in @andes-hack/matching is
// the only place these constants live: the engine computes with them and /datos shows them.
export function createDataSourcesRoutes() {
  const app = new OpenAPIHono();

  app.openapi(dataSourcesRoute, (c) =>
    c.json({ sources: Object.entries(sources).map(([id, source]) => ({ id, ...source })) }, 200),
  );

  return app;
}
