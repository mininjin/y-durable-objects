# Y Durable Objects Example

This is an example of how to use y-durable-objects.

This example is made up of two parts:

- The frontend that uses Yjs to sync data made of react and lexical.
- The backend that uses y-durable-objects to store the data using Cloudflare workers(wrangler).

## Setup

### Frontend

```bash
yarn install
yarn dev
```

And open `http://localhost:5137`.

## Backend

```bash
cd server
yarn install
yarn dev
```

Server will be running on `http://localhost:8787`.
