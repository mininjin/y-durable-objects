import { DurableObject } from "cloudflare:workers";
import { MESSAGE_TYPE, WSSharedDoc } from "./ws-shared-doc";
import {
	YDurableObjectPersistence,
	YDurableObjectPersistenceOptions,
} from "./persistence";

export type YDurableObjectOptions = YDurableObjectPersistenceOptions;

export class YDurableObject<T = any> extends DurableObject<T> {
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
		const updateType = this.doc.message(ws, update);

		switch (updateType) {
			case MESSAGE_TYPE.UPDATE:
				await this.onYDocUpdate();
				break;
			case MESSAGE_TYPE.AWARENESS:
				await this.onAwarenessUpdate();
				break;
		}
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		console.error("WebSocket error occurred");
		await this.disconnect(ws);
		ws.close(undefined, "Some error occurred in WebSocket client");
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		ws.close(code, "Durable Object is closing WebSocket connection");
		await this.disconnect(ws);
	}

	async getYDoc() {
		return this.persistence.getYDoc();
	}

	onYDocUpdate(): void | Promise<void> {}
	onAwarenessUpdate(): void | Promise<void> {}

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
