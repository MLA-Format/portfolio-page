import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

// Read-only proxy to the backend worker over its service binding.
// /api/skills -> backend /skills, /api/ -> backend /
app.get("/api/*", (c) => {
	const url = new URL(c.req.url);
	url.pathname = url.pathname.replace(/^\/api/, "") || "/";
	return c.env.worker.fetch(new Request(url, c.req.raw));
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
