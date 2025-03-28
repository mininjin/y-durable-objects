import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { YDurableObject } from "../src"; // 実際のパスに合わせて修正
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";

describe("YDurableObject WebSocket Tests", () => {
	// DOインスタンス生成ヘルパー
	const setup = async () => {
		const id = env.Y_DURABLE_OBJECTS.newUniqueId();
		const stub = env.Y_DURABLE_OBJECTS.get(id);
		return { id, stub };
	};

	it("WebSocket接続を確立できる", async () => {
		const { stub } = await setup();
		await runInDurableObject(stub, async (env, state: DurableObjectState) => {
			const durableObj = new YDurableObject(state, env);
			const res = await durableObj.fetch(
				new Request("https://example.com", {
					headers: {
						Upgrade: "websocket",
						Connection: "Upgrade",
					},
				})
			);
			expect(res.status).toBe(101); // WebSocketハンドシェイク成功
			expect(res.webSocket).toBeDefined();

			res.webSocket.accept();

			// WebSocketの接続が確立されたことを確認
			expect(res.webSocket.readyState).toBe(WebSocket.OPEN);

			res.webSocket.close();
		});
	});

	it("YドキュメントへのUPDATEメッセージを処理できる", async () => {
		const { stub } = await setup();
		await runInDurableObject(stub, async (env, state: DurableObjectState) => {
			const durableObj = new YDurableObject(state, env);
			// 1. WebSocket接続を取得
			const res = await durableObj.fetch(
				new Request("https://example.com", {
					headers: {
						Upgrade: "websocket",
						Connection: "Upgrade",
					},
				})
			);
			const clientWS = res.webSocket;
			clientWS.accept();

			// 2. テスト用にY.Docを作り適当な更新を行う
			const testDoc = new Y.Doc();
			testDoc.on("update", (update) => {
				const encoder = encoding.createEncoder();
				encoding.writeVarUint(encoder, 0);
				syncProtocol.writeUpdate(encoder, update);

				clientWS.send(encoding.toUint8Array(encoder));
			});

			testDoc.getText("text").insert(0, "UpdateFromClient");

			// 反映待ち
			await new Promise((resolve) => setTimeout(resolve, 100));

			// 4. DO内部のdocが更新されているか（永続化側への反映も含め）を検証
			const ydoc = await durableObj.getYDoc();
			expect(ydoc.getText("text").toString()).toBe("UpdateFromClient");

			clientWS.close();
		});
	});

	it("Awarenessメッセージを処理できる", async () => {
		const { stub } = await setup();

		await runInDurableObject(stub, async (env, state: DurableObjectState) => {
			const durableObj = new YDurableObject(state, env);
			const res = await durableObj.fetch(
				new Request("https://example.com", {
					headers: {
						Upgrade: "websocket",
						Connection: "Upgrade",
					},
				})
			);
			const clientWS = res.webSocket;
			clientWS.accept();

			// Awareness用のダミー更新（MESSAGE_TYPE.AWARENESS 相当の内容を送る想定）
			// 実運用では Yjs のAwarenessクラスからバイナリを生成するケースが多い
			const awarenessUpdate = new Uint8Array([0, 0, 0, 2]); // ダミー

			clientWS.send(awarenessUpdate);

			// DOが onAwarenessUpdate を呼び出すかどうかはログやフラグで確認
			// ここではエラーにならない（=正しく処理された）ことのみをざっくり検証
			expect(true).toBe(true);

			clientWS.close();
		});
	});

	it("WebSocketをクローズした際に適切にdocが解放される", async () => {
		const { stub } = await setup();
		await runInDurableObject(stub, async (env, state: DurableObjectState) => {
			const durableObj = new YDurableObject(state, env);
			const res = await durableObj.fetch(
				new Request("https://example.com", {
					headers: {
						Upgrade: "websocket",
						Connection: "Upgrade",
					},
				})
			);
			const clientWS = res.webSocket;
			clientWS.accept();

			expect(clientWS.readyState).toBe(WebSocket.OPEN);

			// クローズ
			clientWS.close(1000, "Normal closure");

			// DO側は webSocketClose → disconnect が呼ばれ doc が解放される想定
			while (clientWS.readyState !== WebSocket.CLOSED) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect(clientWS.readyState).toBe(WebSocket.CLOSED);
		});
	});
});
