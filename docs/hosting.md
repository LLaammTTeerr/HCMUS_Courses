# Hosting: Tailscale only, or public through a Funnel

> **Current setup (since 2026-09-21):** the app runs as a systemd user service
> (`hcmus-progress.service`, production build, bound to `127.0.0.1:5174`) and is published publicly at
> **https://g14rice.taile98b1e.ts.net:8443** through a Tailscale Funnel. Sign-in is the only way in.

The app is built to run behind a proxy on the same machine. It trusts `x-forwarded-for` and
`x-forwarded-proto` **only** from a loopback peer (or when `TRUST_PROXY=1` is set), so a client that
reaches the server directly cannot fake its address or pretend the connection was HTTPS.

## A. Tailnet only (what you have now)

```bash
npm run dev            # UI :5173, API :5174, reachable at http://<machine>.<tailnet>.ts.net:5173
```

Plain HTTP inside the tailnet. Sessions still require a password; cookies are not marked `Secure`
because the connection is not HTTPS.

## B. Public HTTPS through a Tailscale Funnel

Use this when someone who is not on your tailnet needs access. Requirements: HTTPS certificates enabled
for the tailnet (already on for `g14rice.taile98b1e.ts.net`) and the `funnel` attribute allowed for this
machine in the tailnet policy.

1. **Run the production server, bound to localhost only** — the Funnel is the only way in:

   ```bash
   npm run build
   PORT=5174 HOST=127.0.0.1 npm start
   ```

2. **Publish it.** Port 443 already serves something else on this machine, so use 8443:

   ```bash
   tailscale funnel --bg --https=8443 http://127.0.0.1:5174
   tailscale funnel status
   ```

   The public URL is `https://g14rice.taile98b1e.ts.net:8443`. Tailscale terminates TLS and forwards
   with `x-forwarded-proto: https`, so session cookies become `Secure` automatically.

3. **Turn it off again:**

   ```bash
   tailscale funnel --https=8443 off
   ```

### Before going public, check

- The admin password is no longer the generated one from the log.
- Invite codes are the only way to register — there is no open sign-up.
- Failed sign-ins are rate limited per client address (10 per 5 minutes), in memory, so the counter
  resets when the server restarts.
- Everyone's grades live in one SQLite file; keep `npm run backup` scheduled (see README → Your data).

### Behind a different proxy (nginx, Caddy, Cloudflare)

Set `TRUST_PROXY=1` when the proxy is not on this machine, and make sure it sets `x-forwarded-for` and
`x-forwarded-proto`. Without that the app sees the proxy's address for every visitor, which weakens rate
limiting, and cookies stay non-`Secure`.

## Working on the app while it is served

The service owns port 5174, so `npm run dev` cannot bind the API. Either stop the service first
(`systemctl --user stop hcmus-progress`), or run the dev pair on other ports:

```bash
PORT=5175 npx tsx server/index.ts &
API_PORT=5175 npx vite --port 5176
```

After changing code, rebuild and restart the service: `npm run build && systemctl --user restart hcmus-progress`.

Useful commands: `systemctl --user status hcmus-progress`, `journalctl --user -u hcmus-progress -f`.

## Keeping it running

The service is installed at `~/.config/systemd/user/hcmus-progress.service` with lingering enabled, so it
survives logout and reboots. For reference, the unit is:

```ini
# ~/.config/systemd/user/hcmus-progress.service
[Unit]
Description=HCMUS Progress
After=network.target

[Service]
WorkingDirectory=%h/Projects/HCMUS_Courses
Environment=NODE_ENV=production PORT=5174 HOST=127.0.0.1
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now hcmus-progress
loginctl enable-linger "$USER"     # keeps it running after logout
```

To take the site off the public internet again (it stays reachable on the tailnet through the same URL
only while the funnel is on; stop the service to shut it down completely):

```bash
tailscale funnel --https=8443 off
systemctl --user stop hcmus-progress     # optional: stop the app as well
```
