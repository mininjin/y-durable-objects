import { Env } from "hono";
import { YDurableObject } from "@mininjin/y-durable-objects";

type Bindings = {
	Y_DURABLE_OBJECTS: DurableObjectNamespace<YDurableObject>;
};

declare interface ProvidedEnv extends Env {
	Bindings: Bindings;
}
