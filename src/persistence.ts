import { Doc, applyUpdate, mergeUpdates } from "yjs";

export type YDurableObjectPersistenceOptions = {
	flushBytes?: number;
	flushUpdateClock?: number;
	maxChunkBytes?: number;
};

export const DEFAULT_FLUSH_BYTES = 1024 * 10; // 10 KiB
export const DEFAULT_CHUNK_MAX_BYTES = 1024 * 100; // 100 KiB
export const DEFAULT_FLUSH_UPDATE_CLOCK = 300;
export const UPDATE_KEY_MAX_DIGITS = 6;
export const VERSION = "v1";
export const KEY_PREFIX = [VERSION, "ydoc"].join(":");
export const BYTES_KEY = [KEY_PREFIX, "bytes"].join(":");
const UPDATES_KEY = "updates";
const MERGED_KEY = "merged";
export const UPDATES_KEY_PREFIX = [KEY_PREFIX, UPDATES_KEY].join(":");
export const MERGED_KEY_PREFIX = [KEY_PREFIX, MERGED_KEY].join(":");

export const createStorageKey = (
	type: typeof UPDATES_KEY | typeof MERGED_KEY,
	clock: number
) => {
	let key = [KEY_PREFIX, type].join(":");
	if (clock !== undefined) {
		key = [key, clock.toString().padStart(UPDATE_KEY_MAX_DIGITS, "0")].join(
			":"
		);
	}
	return key;
};

/**
 * @description get all updates from storage
 */
const getAllUpdates = async (
	tx: DurableObjectTransaction
): Promise<{ updates: Uint8Array[]; clock: number }> => {
	const data = await tx.list<Uint8Array>({
		prefix: UPDATES_KEY_PREFIX,
		noCache: true,
	});
	const updates = Array.from(data.values());
	const clock = getLastClock(Array.from(data.keys()));
	return { updates, clock };
};

/**
 * @description get all merged updates from storage
 */
const getAllMergedUpdates = async (
	tx: DurableObjectTransaction
): Promise<{ updates: Uint8Array[]; clock: number }> => {
	const data = await tx.list<Uint8Array>({
		prefix: MERGED_KEY_PREFIX,
		noCache: true,
	});
	const updates = Array.from(data.values());
	const clock = getLastClock(Array.from(data.keys()));
	return { updates, clock };
};

/**
 * @description get the last clock from a list of update keys
 */
const getLastClock = (keys: string[]) => {
	// sort by utf-8 ascending order
	keys = keys.sort();
	const lastKey = keys[keys.length - 1];
	return lastKey ? parseInt(lastKey.split(":").pop() ?? "-1") : -1;
};

/**
 * @description get the last update clock from storage
 * @returns the clock of the last update. if no updates are found, -1 is returned
 */
const getCurrentUpdateClock = async (tx: DurableObjectTransaction) => {
	const data = await tx.list({
		prefix: UPDATES_KEY_PREFIX,
		limit: 1,
		reverse: true,
		noCache: true,
	});
	const clock = getLastClock(Array.from(data.keys()));
	return clock;
};

/**
 * @description get the last update clock from storage
 * @returns the clock of the last update. if no updates are found, -1 is returned
 */
const getCurrentMergedUpdate = async (
	tx: DurableObjectTransaction
): Promise<{
	update: Uint8Array | undefined;
	clock: number;
}> => {
	const data = await tx.list<Uint8Array>({
		prefix: MERGED_KEY_PREFIX,
		limit: 1,
		reverse: true,
		noCache: true,
	});
	const clock = getLastClock(Array.from(data.keys()));
	if (clock === -1) return { update: undefined, clock: -1 };

	const update = data.get(createStorageKey("merged", clock));
	return { update, clock };
};

/**
 * @description merge all updates into a single update and save it as first update
 * @returns the clock of committed document
 */
const flushDocument = async (
	tx: DurableObjectTransaction,
	updates: Uint8Array[],
	clock: number,
	maxChunkBytes?: number
) => {
	const current = await getCurrentMergedUpdate(tx);
	const chunks = mergeUpdatesToChunk(updates, current.update, maxChunkBytes);

	// store the merged update
	const start = current.clock >= 0 ? current.clock : 0;
	for (let i = start; i < chunks.length; i++) {
		const chunk = chunks[i - start];
		const key = createStorageKey("merged", i);
		await tx.put(key, chunk);
	}

	// clear all updates after the last chunk
	await clearUpdatesRange(tx, 0, clock);
	// clear bytes counter
	await tx.delete(BYTES_KEY);
};

/**
 *
 * @description merge updates into chunks.
 */
const mergeUpdatesToChunk = (
	[...updates]: Uint8Array[],
	current?: Uint8Array,
	maxChunkBytes = DEFAULT_CHUNK_MAX_BYTES
): Uint8Array[] => {
	if (updates.length === 0) return current ? [current] : [];

	current = current || updates[0];

	const chunks: Uint8Array[] = [];
	while (updates.length > 0) {
		// merge updates until the chunk size limit is reached
		{
			const mergedUpdates = [];
			let bytes = current.byteLength;
			let currentUpdateIndex = -1;
			for (const update of updates) {
				if (bytes + update.byteLength <= maxChunkBytes) {
					mergedUpdates.push(update);
					currentUpdateIndex++;
					bytes += update.byteLength;
				}
			}
			current = mergeUpdates([current, ...mergedUpdates]);
			updates = updates.slice(currentUpdateIndex + 1);
		}

		// check if the update can be merged with current chunk. If not, start a new chunk
		{
			let currentUpdateIndex = -1;
			for (const update of updates) {
				const nextChunk = mergeUpdates([current, update]);
				if (nextChunk.byteLength > maxChunkBytes) {
					chunks.push(current);
					current = update;
					currentUpdateIndex++;
					break;
				} else {
					current = nextChunk;
					currentUpdateIndex++;
				}
			}
			updates = updates.slice(currentUpdateIndex + 1);
		}
	}

	chunks.push(current);

	return chunks;
};

/**
 *  @description clear range of updates from storage.
 */
const clearUpdatesRange = async (
	tx: DurableObjectTransaction,
	startAt: number,
	endAt: number
) => {
	for (let i = startAt; i <= endAt; i++) {
		const key = createStorageKey("updates", i);
		await tx.delete(key);
	}
};

/**
 *  @description put update into storage
 */
const writeUpdate = async (
	tx: DurableObjectTransaction,
	update: Uint8Array,
	clock: number
) => {
	const updateKey = createStorageKey("updates", clock);
	await tx.put(updateKey, update);

	// update the bytes counter
	let bytes = await tx.get<number>(BYTES_KEY);
	if (bytes === undefined) {
		bytes = 0;
	}
	bytes += update.byteLength;
	await tx.put(BYTES_KEY, bytes);
};

/**
 * @description insert update into storage
 * @returns the clock of the update
 */
const storeUpdate = async (
	tx: DurableObjectTransaction,
	update: Uint8Array
) => {
	const clock = await getCurrentUpdateClock(tx);

	const nextClock = clock + 1;

	await writeUpdate(tx, update, nextClock);

	return nextClock;
};

/**
 * @description YDurableObjectPersistence is a class that provides an interface to persist and retrieve Yjs documents in a Durable Object Transactional Storage.
 */
export class YDurableObjectPersistence {
	private readonly flushBytes: number;
	private readonly flushUpdateClock: number;
	private readonly maxChunkBytes: number;

	constructor(
		private readonly ctx: DurableObjectState,
		options: YDurableObjectPersistenceOptions = {}
	) {
		this.flushBytes = options.flushBytes ?? DEFAULT_FLUSH_BYTES;
		this.flushUpdateClock =
			options.flushUpdateClock ?? DEFAULT_FLUSH_UPDATE_CLOCK;
		this.maxChunkBytes = options.maxChunkBytes ?? DEFAULT_CHUNK_MAX_BYTES;
	}

	private get storage() {
		return this.ctx.storage;
	}

	/**
	 * @description Internally YDurableObjectPersistence stores incremental updates. This method merges all updates into several chunks. (The reason why updates are not merged into a single update is due to the size limit of the values in Transactional Storage.)
	 */
	flushDocument(): Promise<void> {
		return this.storage.transaction(async (tx) => {
			const { updates, clock } = await getAllUpdates(tx);
			await flushDocument(tx, updates, clock, this.maxChunkBytes);
		});
	}

	/**
	 * @description Create a Y.Doc instance with the data persisted in Durable Object Transactional Storage. Use this to temporarily create a Yjs document to sync changes or extract data.
	 * @returns the Yjs document
	 */
	getYDoc() {
		return this.storage.transaction(async (tx) => {
			const { updates: mergedUpdates } = await getAllMergedUpdates(tx);
			const { updates, clock } = await getAllUpdates(tx);
			const ydoc = new Doc();

			const update = mergeUpdates([...mergedUpdates, ...updates]);
			ydoc.transact(() => {
				applyUpdate(ydoc, update);
			});

			// check if we need to flush the document
			const bytes = (await tx.get<number>(BYTES_KEY)) || 0;
			if (updates.length >= this.flushUpdateClock || bytes >= this.flushBytes) {
				await flushDocument(tx, updates, clock, this.maxChunkBytes);
			}

			return ydoc;
		});
	}

	/**
	 * @description Store a single document update to the database. This method is used to store updates that are received from clients.
	 * @returns the clock of the update
	 */
	storeUpdate(update: Uint8Array) {
		return this.storage.transaction((tx) => storeUpdate(tx, update));
	}

	/**
	 * @description clear all updates from storage
	 */
	clear() {
		return this.storage.deleteAll();
	}
}
