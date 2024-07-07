# yjs-examples-server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.8. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## modules

- YDurableObject
- WSSSharedDoc
- DurableObjectPersistence

## YDurableObject

Yjs Durable Object is a Yjs binding for Cloudflare Durable Objects. It allows you to share Yjs documents between clients in a distributed environment. YDurableObject is a subclass of Y.Doc that automatically syncs changes between clients.

## WSSSharedDoc

WSSSharedDoc is a class that manages the sharing Yjs document. It is a subclass of Yjs Doc. It is used to create a Yjs document that is shared between clients. On update, it will broadcast the update to all clients.

## DurableObjectPersistence

DurableObjectPersistence is a class that stores the Yjs document in Durable Objects Transactional Storage. It is used to persist the Yjs document in a distributed environment.
