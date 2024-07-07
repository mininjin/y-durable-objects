import type { Env } from "hono";
import { YDurableObject } from "../src";

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
    Y_DURABLE_OBJECTS: DurableObjectNamespace<YDurableObject<any>>;
  }
}