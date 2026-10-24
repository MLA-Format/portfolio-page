import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

// Read-only proxy to the backend worker over its service binding.
// /api/skills -> backend /skills, /api/ -> backend /
app.get("/api/*", (c) => {
	const url = new URL(c.req.url);
	url.pathname = url.pathname.replace(/^\/api/, "") || "/";
	return c.env.worker.fetch(new Request(url, c.req.raw));
});

// FastAPI's interactive docs. The page loads /openapi.json from this origin, so that is
// proxied too, with its server set to /api so "Try it out" goes through the proxy above.
app.get("/docs", (c) => c.env.worker.fetch(c.req.raw));
app.get("/openapi.json", async (c) => {
	const res = await c.env.worker.fetch(c.req.raw);
	if (!res.ok) return res;
	const spec = await res.json<Record<string, unknown>>();
	return c.json({ ...spec, servers: [{ url: "/api" }] });
});

// R2 objects by key, e.g. /media/icons/python.svg -> key "icons/python.svg".
app.get("/media/*", async (c) => {
	const key = c.req.path.slice("/media/".length);
	const object = key ? await c.env.bucket.get(key) : null;
	if (!object) return c.notFound();

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=86400");
	return new Response(object.body, { headers });
});

export default app;
