# Mohasorok race server

A small relay for "Race with friends". It runs as a Cloudflare Worker with one Durable Object per race room, and the free plan is enough for it. It doesn't store any game data: it passes bus positions between the players in a room and keeps the lobby (host, route, start time, results).

## Test on your computer (no account needed)

```sh
cd race-server
npm install
npm run dev          # ws://localhost:8787
```

In another terminal, run `npm run dev` in `prototype-web/`. Open the game in two browser tabs. In one tab, use **Create a race**. In the other, **Join** with the code.

To test with a phone on the same Wi-Fi, open `http://<your computer's IP>:5173`. The game finds the server at `ws://<same IP>:8787`. Vite only listens on your own computer unless you start it with `npx vite --host`.

## Put it online (free)

1. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up. You don't need a card.
2. Deploy the server:
   ```sh
   cd race-server
   npx wrangler login     # opens the browser once
   npm run deploy
   ```
   The deploy prints the server's address, for example `https://mohasorok-race.<your-name>.workers.dev`.
3. Tell the game where the server is. In `prototype-web/.env.production`, add:
   ```
   VITE_RACE_SERVER=wss://mohasorok-race.<your-name>.workers.dev
   ```
   Use `wss://`, not `https://`. Then commit and push. The GitHub Pages build picks up the address.

`ALLOWED_HOSTS` in `wrangler.toml` lists the sites allowed to connect. Add your own domain there if the game moves.

## Free-plan limits

Each player sends 5 updates a second.

- **Durable Objects:** 100,000 requests a day. WebSocket messages count 20 to 1, so 4 players racing for an hour use about 3,600.
- **Workers:** 100,000 requests a day. Only the joins count here.
- **Duration:** 13,000 GB-s a day. One open room uses about 450 GB-s an hour.

That works out to many hours of 4–8 player races every day.
