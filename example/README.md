# Y Durable Objects Example

This is an example of how to use y-durable-objects.

This example is made up of two parts:

- The frontend, which uses Yjs to sync data and is built with React and Lexical.
- The backend, which uses y-durable-objects to store the data using Cloudflare Workers(wrangler).

## Setup

### Frontend

```bash
yarn install
yarn dev
```

Then open `http://localhost:5137`.

## Backend

```bash
cd server
yarn install
yarn dev
```

The server will be running on `http://localhost:8787`.
