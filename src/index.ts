import { DurableObject } from "cloudflare:workers";
import type { Env } from "hono";
import { WSSharedDoc } from "./ws-shared-doc";
import {
	YDurableObjectPersistence,
	YDurableObjectPersistenceOptions,
} from "./persistence";

export type YDurableObjectOptions = YDurableObjectPersistenceOptions;

export class YDurableObject<T extends Env = any> extends DurableObject<T> {
	readonly doc = new WSSharedDoc<WebSocket>();
	readonly persistence: YDurableObjectPersistence;

	constructor(
		readonly ctx: DurableObjectState,
		readonly env: T,
		options: YDurableObjectOptions = {}
	) {
		super(ctx, env);

		this.persistence = new YDurableObjectPersistence(ctx, options);

		// persistence
		this.doc.setPersistence({
			onUpdate: async (_, update) => {
				await this.persistence.storeUpdate(update);
			},
			onCloseAll: async () => {
				await this.persistence.flushDocument();
			},
		});

		void this.ctx.blockConcurrencyWhile(async () => {
			// bind persisted document to ws shared doc
			const persistedYDoc = await this.persistence.getYDoc();
			this.doc.applyUpdate(persistedYDoc);

			for (const ws of this.ctx.getWebSockets()) {
				this.connect(ws);
			}
		});
	}

	async fetch(_request: Request): Promise<Response> {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		this.connect(server);

		return new Response(null, { webSocket: client, status: 101 });
	}

	async webSocketMessage(
		ws: WebSocket,
		message: string | ArrayBuffer
	): Promise<void> {
		if (!(message instanceof ArrayBuffer)) return;

		const update = new Uint8Array(message);
		this.doc.message(ws, update);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.disconnect(ws);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.disconnect(ws);
	}

	async getYDoc() {
		return this.persistence.getYDoc();
	}

	private connect(ws: WebSocket) {
		this.doc.setupConn(ws, (message) => {
			ws.send(message);
		});
	}

	private async disconnect(ws: WebSocket) {
		this.doc.closeConn(ws);
	}
}

export { YDurableObjectPersistence, WSSharedDoc };
