# y-durable-objects

> Cloudflare Workers Durable Objects for Yjs

This library is for using Yjs with Cloudflare Workers Durable Objects. The implementation is based on [y-websocket](https://github.com/yjs/y-websocket) and [y-leveldb](https://github.com/yjs/y-leveldb).

In Cloudflare Workers Durable Objects' Transaction Storage, there is a [128KiB data limit per key](https://developers.cloudflare.com/durable-objects/platform/limits/). Therefore, this library splits updates into multiple chunks during flush operations to accommodate this limit.

## Installation

```bash
npm install y-durable-objects

# or with yarn
yarn add y-durable-objects

```

## Usage

### Basic Usage

```ts
import { YDurableObject, YDurableObjectOptions } from "y-durable-objects";

const options: YDurableObjectOptions = {
  // Options here
};

// Durable Object
export class WebSocketServer extends YDurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, options);
  }
}
```

### Options

- `flushBytes` - Byte count threshold to flush updates. When the sum of bytes of updates exceeds this threshold, the updates will be flushed automatically, and the update count and the byte count will be reset. Default: `10 * 1024` (10KiB)
- `flushUpdateClock` - Update count threshold to flush updates. When the total number of updates exceeds this threshold, the updates will be flushed automatically. Default: `300`
- `maxChunkBytes` - Maximum byte size of each merged update. Default: `100 * 1024` (100KiB)

## Example

See the [example](./example/) directory for a simple example.

## License

This project is licensed under the MIT License.
