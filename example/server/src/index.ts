import { Hono } from "hono";
import { cors } from "hono/cors";
import { websocketUpgradeMiddleware } from "./middleware/websocket";
import { ProvidedEnv } from "./env";
import { YDurableObject } from "y-durable-objects";

const app = new Hono<ProvidedEnv>();
app.use("*", cors());

app.get("/:id", websocketUpgradeMiddleware(), async (ctx) => {
	const durableObj = ctx.env.Y_DURABLE_OBJECTS;
	const stab = durableObj.get(durableObj.idFromName(ctx.req.param("id")));

	const url = new URL("/", ctx.req.url);
	const res = await stab.fetch(url.href, {
		headers: ctx.req.raw.headers,
	});
	if (!res.webSocket) return ctx.body(null, 500);

	return new Response(null, { webSocket: res.webSocket, status: res.status });
});

export default app;

export { YDurableObject };
