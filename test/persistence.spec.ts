import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import {
	YDurableObjectPersistence,
	createStorageKey,
	BYTES_KEY,
	UPDATES_KEY_PREFIX,
	MERGED_KEY_PREFIX,
} from "../src/persistence";
import * as Y from "yjs";

describe("YDurableObjectPersistence Unit Tests", () => {
	const setup = async () => {
		const id = env.Y_DURABLE_OBJECTS.newUniqueId();
		const stub = env.Y_DURABLE_OBJECTS.get(id);
		return { id, stub };
	};

	describe("storeUpdate method", () => {
		it("storeUpdate stores the update in the storage", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const update = new Uint8Array([1, 2, 3, 4]);

				// Execute storeUpdate method
				const clock = await persistence.storeUpdate(update);

				// Retrieve stored update from the storage
				const storedUpdate = await state.storage.get(
					createStorageKey("updates", clock)
				);

				// Verify the stored update
				expect(storedUpdate).toEqual(update);

				// Verify the bytes counter
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toEqual(update.byteLength);
			});
		});

		it("storeUpdate increments the clock correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const update1 = new Uint8Array([1, 2, 3, 4]);
				const update2 = new Uint8Array([5, 6, 7, 8]);

				// Execute storeUpdate method
				const clock1 = await persistence.storeUpdate(update1);
				const clock2 = await persistence.storeUpdate(update2);

				// Verify the clocks
				expect(clock1).toBe(0);
				expect(clock2).toBe(1);

				// Retrieve stored updates from the storage
				const storedUpdate1 = await state.storage.get(
					createStorageKey("updates", clock1)
				);
				const storedUpdate2 = await state.storage.get(
					createStorageKey("updates", clock2)
				);

				// Verify the stored updates
				expect(storedUpdate1).toEqual(update1);
				expect(storedUpdate2).toEqual(update2);
			});
		});

		it("storeUpdate handles multiple updates correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const updates = [
					new Uint8Array([1, 2, 3]),
					new Uint8Array([4, 5, 6]),
					new Uint8Array([7, 8, 9]),
				];

				// Execute storeUpdate method for each update
				let clock = -1;
				for (const update of updates) {
					clock = await persistence.storeUpdate(update);
				}

				// Verify the clock
				expect(clock).toBe(2);

				// Retrieve stored updates from the storage
				for (let i = 0; i < updates.length; i++) {
					const storedUpdate = await state.storage.get(
						createStorageKey("updates", i)
					);
					expect(storedUpdate).toEqual(updates[i]);
				}

				// Verify the bytes counter
				const totalBytes = updates.reduce(
					(sum, update) => sum + update.byteLength,
					0
				);
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toEqual(totalBytes);
			});
		});

		it("storeUpdate does not overwrite existing updates", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const update1 = new Uint8Array([1, 2, 3, 4]);
				const update2 = new Uint8Array([5, 6, 7, 8]);

				// Execute storeUpdate method
				const clock1 = await persistence.storeUpdate(update1);
				const clock2 = await persistence.storeUpdate(update2);

				// Verify the clocks
				expect(clock1).toBe(0);
				expect(clock2).toBe(1);

				// Execute storeUpdate method again with the same updates
				const clock3 = await persistence.storeUpdate(update1);
				const clock4 = await persistence.storeUpdate(update2);

				// Verify the clocks
				expect(clock3).toBe(2);
				expect(clock4).toBe(3);

				// Retrieve stored updates from the storage
				for (let i = 0; i < 2; i++) {
					const storedUpdate = await state.storage.get(
						createStorageKey("updates", i)
					);
					expect(storedUpdate).toEqual(i === 0 ? update1 : update2);
				}

				for (let i = 2; i < 4; i++) {
					const storedUpdate = await state.storage.get(
						createStorageKey("updates", i)
					);
					expect(storedUpdate).toEqual(i === 2 ? update1 : update2);
				}

				// Verify the bytes counter
				const totalBytes = 2 * (update1.byteLength + update2.byteLength);
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toEqual(totalBytes);
			});
		});
	});

	describe("flushDocument method", () => {
		const largeText =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ";

		it("flushDocument merges updates and stores them correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Hello");
				const update1 = Y.encodeStateAsUpdate(ydoc);

				ydoc.getText("text").insert(5, " World");
				const update2 = Y.encodeStateAsUpdate(ydoc);

				ydoc.getText("text").delete(5, 1);
				const update3 = Y.encodeStateAsUpdate(ydoc);

				const updates = [update1, update2, update3];

				// Store updates
				for (const update of updates) {
					await persistence.storeUpdate(update);
				}

				// Execute flushDocument method
				await persistence.flushDocument();

				// Retrieve merged updates from the storage
				const mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				const mergedUpdate = Array.from(mergedUpdates.values())[0];

				// Verify the merged update
				const expectedMergedUpdate = Y.mergeUpdates(updates);
				expect(mergedUpdate).toEqual(expectedMergedUpdate);

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();
			});
		});

		it("flushDocument handles empty updates correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Execute flushDocument method with no updates stored
				await persistence.flushDocument();

				// Verify no merged updates exist
				const mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				expect(mergedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();
			});
		});

		it("flushDocument handles updates just below the size limit correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				const updateLength = 400;
				const updates: Uint8Array[] = [];
				for (let i = 0; i < updateLength; i++) {
					ydoc.getText("text").insert(i * largeText.length, largeText);
					const update = Y.encodeStateAsUpdate(ydoc);
					updates.push(update);
					await persistence.storeUpdate(update);
				}

				// Execute flushDocument method
				await persistence.flushDocument();

				// Retrieve merged updates from the storage
				const mergedUpdates = await state.storage.list<Uint8Array>({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				const mergedUpdate = Y.mergeUpdates(Array.from(mergedUpdates.values()));
				const mergedDoc = new Y.Doc();
				Y.applyUpdate(mergedDoc, mergedUpdate);
				expect(mergedDoc.getText("text").toString()).toBe(
					ydoc.getText("text").toString()
				);

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();
			});
		});

		it("flushDocument handles updates that exceed the size limit", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state, {
					maxChunkBytes: 100,
				});

				// Test data
				const ydoc = new Y.Doc();
				for (let i = 0; i < 60; i++) {
					ydoc.getText("text").insert(i * largeText.length, largeText);
					const update = Y.encodeStateAsUpdate(ydoc);
					await persistence.storeUpdate(update);
				}

				// Execute flushDocument method
				await persistence.flushDocument();

				// Retrieve merged updates from the storage
				const mergedUpdates = await state.storage.list<Uint8Array>({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				const mergedUpdateArray = Array.from(mergedUpdates.values());

				// Verify the merged updates
				expect(mergedUpdateArray.length).toBeGreaterThan(1); // 複数のチャンクが作成されることを確認
				expect(mergedUpdateArray[0].length).toBeGreaterThan(0);
				expect(mergedUpdateArray[1].length).toBeGreaterThan(0);

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();
			});
		});

		it("flushDocument correctly merges partial updates and clears old updates", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc1 = new Y.Doc();
				ydoc1.getText("text").insert(0, "123");
				const update1 = Y.encodeStateAsUpdate(ydoc1);

				ydoc1.getText("text").insert(3, "456");
				const update2 = Y.encodeStateAsUpdate(ydoc1);

				ydoc1.getText("text").insert(6, "789");
				const update3 = Y.encodeStateAsUpdate(ydoc1);

				const updates1 = [update1, update2, update3];

				// Store first set of updates
				for (const update of updates1) {
					await persistence.storeUpdate(update);
				}

				// Execute first flushDocument method
				await persistence.flushDocument();

				// Store second set of updates
				const ydoc2 = new Y.Doc();
				ydoc2.getText("text").insert(0, "123456789");
				const newUpdate1 = Y.encodeStateAsUpdate(ydoc2);

				ydoc2.getText("text").insert(9, "101112");
				const newUpdate2 = Y.encodeStateAsUpdate(ydoc2);

				const updates2 = [newUpdate1, newUpdate2];

				for (const update of updates2) {
					await persistence.storeUpdate(update);
				}

				// Execute second flushDocument method
				await persistence.flushDocument();

				// Retrieve merged updates from the storage
				const mergedUpdates = await state.storage.list<Uint8Array>({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				const mergedUpdateArray = Array.from(mergedUpdates.values());
				const mergedUpdate = Y.mergeUpdates(mergedUpdateArray);

				// Verify the merged updates
				const allUpdates = Y.mergeUpdates([
					Y.mergeUpdates(updates1),
					...updates2,
				]);
				expect(mergedUpdateArray.length).toBe(1);
				expect(mergedUpdate).toEqual(allUpdates);

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();
			});
		});
	});

	describe("getYDoc method", () => {
		it("retrieves an empty document when no updates are stored", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Execute getYDoc method
				const ydoc = await persistence.getYDoc();

				// Verify the document is empty
				expect(ydoc.getText("text").toString()).toEqual("");
			});
		});

		it("applies a single update correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Hello");
				const update = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the update is applied
				expect(retrievedDoc.getText("text").toString()).toEqual("Hello");
			});
		});

		it("applies multiple updates correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Hello");
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(5, " World");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the updates are applied
				expect(retrievedDoc.getText("text").toString()).toEqual("Hello World");
			});
		});

		it("retrieves the document after flush", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Hello");
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(5, " World");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				await persistence.flushDocument();

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the updates are applied
				expect(retrievedDoc.getText("text").toString()).toEqual("Hello World");
			});
		});

		it("handles updates just below the size limit correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const options = { flushBytes: 50 }; // 適切なオプションを指定
				const persistence = new YDurableObjectPersistence(state, options);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "A".repeat(49));
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(49, "B");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the updates are applied
				expect(retrievedDoc.getText("text").toString()).toEqual(
					"A".repeat(49) + "B"
				);
			});
		});

		it("handles updates that exceed the size limit", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const options = { flushBytes: 50 }; // 適切なオプションを指定
				const persistence = new YDurableObjectPersistence(state, options);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "A".repeat(50));
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(50, "B");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the updates are applied
				expect(retrievedDoc.getText("text").toString()).toEqual(
					"A".repeat(50) + "B"
				);
			});
		});

		it("applies partial updates correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "123");
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(3, "456");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				ydoc.getText("text").insert(6, "789");
				const update3 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update3);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the updates are applied
				expect(retrievedDoc.getText("text").toString()).toEqual("123456789");
			});
		});

		it("applies unflushed updates correctly", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Unflushed");
				const update = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the update is applied
				expect(retrievedDoc.getText("text").toString()).toEqual("Unflushed");
			});
		});

		it("does not apply the same update multiple times", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Duplicate");
				const update = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update);
				await persistence.storeUpdate(update);

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the update is applied only once
				expect(retrievedDoc.getText("text").toString()).toEqual("Duplicate");
			});
		});

		it("retrieves an empty document after clearing all updates", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "To be cleared");
				const update = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update);

				// Clear all updates
				await persistence.clear();

				// Execute getYDoc method
				const retrievedDoc = await persistence.getYDoc();

				// Verify the document is empty
				expect(retrievedDoc.getText("text").toString()).toEqual("");
			});
		});
	});

	describe("clear method", () => {
		it("clears all updates and resets the storage", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "Clear me");
				const update = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update);

				// Ensure the update is stored
				const storedUpdate = await state.storage.get(
					createStorageKey("updates", 0)
				);
				expect(storedUpdate).toEqual(update);

				// Execute clear method
				await persistence.clear();

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();

				// Verify the merged updates are cleared
				const mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				expect(mergedUpdates.size).toBe(0);
			});
		});

		it("clear works correctly when there are no updates", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Execute clear method when there are no updates
				await persistence.clear();

				// Verify the updates are cleared
				const storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();

				// Verify the merged updates are cleared
				const mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				expect(mergedUpdates.size).toBe(0);
			});
		});

		it("clear works correctly after multiple updates and flushes", async () => {
			const { stub } = await setup();
			await runInDurableObject(stub, async (_, state: DurableObjectState) => {
				await state.storage.deleteAll();
				const persistence = new YDurableObjectPersistence(state);

				// Test data
				const ydoc = new Y.Doc();
				ydoc.getText("text").insert(0, "First update");
				const update1 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update1);

				ydoc.getText("text").insert(11, " Second update");
				const update2 = Y.encodeStateAsUpdate(ydoc);
				await persistence.storeUpdate(update2);

				// Flush updates
				await persistence.flushDocument();

				// Ensure the updates are stored
				let storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				let mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				expect(mergedUpdates.size).toBeGreaterThan(0);

				// Execute clear method
				await persistence.clear();

				// Verify the updates are cleared
				storedUpdates = await state.storage.list({
					prefix: UPDATES_KEY_PREFIX,
					noCache: true,
				});
				expect(storedUpdates.size).toBe(0);

				// Verify the bytes counter is reset
				const bytes = await state.storage.get(BYTES_KEY);
				expect(bytes).toBeUndefined();

				// Verify the merged updates are cleared
				mergedUpdates = await state.storage.list({
					prefix: MERGED_KEY_PREFIX,
					noCache: true,
				});
				expect(mergedUpdates.size).toBe(0);
			});
		});
	});
});
