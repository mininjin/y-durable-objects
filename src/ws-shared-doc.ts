import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates,
} from "y-protocols/awareness";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync";
import {
	writeVarUint8Array,
	writeVarUint,
	toUint8Array,
	createEncoder,
	length,
} from "lib0/encoding";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";

type AwarenessChanges = {
	added: number[];
	updated: number[];
	removed: number[];
};

type Listener<T> = (message: T) => void;

export type Persistence<T extends Object> = {
	onUpdate?: (doc: WSSharedDoc<T>, update: Uint8Array) => Promise<void>;
	onCloseAll?: (doc: WSSharedDoc<T>) => Promise<void>;
};

export const MESSAGE_TYPE = {
	UPDATE: 0,
	AWARENESS: 1,
};

export class WSSharedDoc<T extends Object> extends Doc {
	awareness: Awareness;
	private conns: Map<
		T,
		{ awareness: Set<number>; sendMessage: Listener<Uint8Array> }
	> = new Map();
	private persistence: Persistence<T> | null = null;

	constructor(gcEnabled = false) {
		super({ gc: gcEnabled });

		this.awareness = new Awareness(this);
		this.awareness.setLocalState(null);

		this.awareness.on("update", this.onAwarenessChanged.bind(this));
		this.on("update", this.onUpdated.bind(this));
	}

	/**
	 *
	 * @description Broadcasts the awareness update to all listeners
	 */
	private onAwarenessChanged(
		{ added, updated, removed }: AwarenessChanges,
		_conn: T | null
	) {
		// update awarenessClients
		const conn = _conn ? this.conns.get(_conn) : null;
		if (conn) {
			for (const client of [...added, ...updated]) {
				conn.awareness.add(client);
			}
			for (const client of removed) {
				conn.awareness.delete(client);
			}
		}

		// broadcast awareness update
		const changedClients = added.concat(updated, removed);
		const encoder = createEncoder();
		writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
		writeVarUint8Array(
			encoder,
			encodeAwarenessUpdate(this.awareness, changedClients)
		);
		const buff = toUint8Array(encoder);

		this.broadcast(buff);
	}

	/**
	 *
	 * @description Broadcasts the update to all listeners
	 */
	private onUpdated(update: Uint8Array) {
		const encoder = createEncoder();
		writeVarUint(encoder, MESSAGE_TYPE.UPDATE);
		writeUpdate(encoder, update);

		this.broadcast(toUint8Array(encoder));

		// write update to persistence
		this.persistence?.onUpdate?.(this, update);
	}

	/**
	 * @param conn Object
	 * @param message Unit8Array
	 * @description Broadcasts the message to all listeners
	 */
	private send(_conn: T, message: Uint8Array) {
		const conn = this.conns.get(_conn);
		conn?.sendMessage(message);
	}

	/**
	 *
	 * @param message Unit8Array
	 * @description Broadcasts the message to all listeners
	 */
	private broadcast(message: Uint8Array) {
		for (const conn of this.conns.keys()) {
			this.send(conn, message);
		}
	}

	/**
	 *
	 * @param message
	 *
	 * @returns message type. null if error.
	 */
	message(conn: T, message: Uint8Array) {
		try {
			const encoder = createEncoder();
			const decoder = createDecoder(message);
			const messageType = readVarUint(decoder);
			switch (messageType) {
				case MESSAGE_TYPE.UPDATE:
					writeVarUint(encoder, MESSAGE_TYPE.UPDATE);
					// logUpdate(message);
					readSyncMessage(decoder, encoder, this, conn);

					if (length(encoder) > 1) {
						const buf = toUint8Array(encoder);
						this.send(conn, buf);
					}
					break;
				case MESSAGE_TYPE.AWARENESS:
					applyAwarenessUpdate(
						this.awareness,
						readVarUint8Array(decoder),
						conn
					);
					break;
			}
			return messageType;
		} catch (err) {
			console.error(err);
			// @ts-ignore
			this.emit("error", [err]);
			return null;
		}
	}

	/**
	 *
	 * @param doc Object
	 * @description Applies the update to the document
	 */
	applyUpdate(doc: Doc) {
		applyUpdate(this, encodeStateAsUpdate(doc));
	}

	/**
	 * @param conn Object
	 * @param sendMessage Unit8Array => void
	 */
	setupConn(conn: T, sendMessage: Listener<Uint8Array>) {
		// send current doc state to new client
		{
			const encoder = createEncoder();
			writeVarUint(encoder, MESSAGE_TYPE.UPDATE);
			writeSyncStep1(encoder, this);
			sendMessage(toUint8Array(encoder));
		}

		// send awareness state to new client
		{
			const states = this.awareness.getStates();
			if (states.size > 0) {
				const encoder = createEncoder();
				writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
				const update = encodeAwarenessUpdate(
					this.awareness,
					Array.from(states.keys())
				);
				writeVarUint8Array(encoder, update);

				sendMessage(toUint8Array(encoder));
			}
		}

		// register conn
		const awareness = new Set<number>();
		this.conns.set(conn, { awareness, sendMessage });
	}

	/**
	 *
	 * @param conn Object
	 */
	closeConn(conn: T) {
		// remove conn
		if (this.conns.has(conn)) {
			const deletedConn = this.conns.get(conn);
			this.conns.delete(conn);
			if (deletedConn) {
				removeAwarenessStates(
					this.awareness,
					Array.from(deletedConn.awareness),
					null
				);
			}
		}

		// if this was the last conn, write state to persistence
		if (this.conns.size < 1) {
			this.persistence?.onCloseAll?.(this);
		}
	}

	get connectionSize() {
		return this.conns.size;
	}

	setPersistence(provider: Persistence<T>) {
		this.persistence = provider;
	}
}
