import { createMiddleware } from "hono/factory";

// https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
export const websocketUpgradeMiddleware = () =>
  createMiddleware(async (ctx, next) => {
    // Expect to receive a WebSocket Upgrade request.
    // If there is one, accept the request and return a WebSocket Response.
    const upgradeHeader = ctx.req.header("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return ctx.body("Durable Object expected Upgrade: websocket", {
        status: 426,
        statusText: "Upgrade Required",
      });
    }

    return next();
  });
