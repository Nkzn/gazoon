# gazoon

Images on Your R2.

**Screenshot. Upload. Copy URL. That's it.** — but the images live in *your*
Cloudflare account, not somebody else's. There is no gazoon service and no
gazoon operator: you deploy your own instance, and nobody but you can read the
bucket it writes to.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nkzn/gazoon)

## What you get

- Drop, paste, or pick an image in the browser → it uploads and the URL lands on
  your clipboard.
- A list of everything you have uploaded, with one-click copy and delete.
- Direct image URLs (`/i/<id>.png`) you can paste anywhere.

## Deploying

Press the button above. Cloudflare forks this repository into your own GitHub or
GitLab account, provisions the R2 bucket and D1 database, and deploys the
Worker. If your Cloudflare account has never used R2, enable it in the dashboard
first so the bucket can be created.

During setup you will be asked for one secret:

| Secret | How to get it |
| --- | --- |
| `UPLOAD_TOKEN` | `openssl rand -hex 32` |

That token is the only credential. Anyone holding it can upload to, list, and
delete from your instance, so treat it like a password. Open your new
`*.workers.dev` URL, paste the token once, and you are done — it is stored in
that browser's `localStorage` and sent as a bearer token from then on.

### Optional hardening

- **Cloudflare Access.** Put a Zero Trust policy on `/` and `/api/*` so the
  admin UI needs your identity as well as the token. Leave `/i/*` out of the
  policy, or your image links stop working for everyone else.
- **Custom domain.** Add a route to the Worker in the dashboard. This is not
  configured automatically, because the deploy button cannot know which zone you
  own.
- **Rotate the token.** `wrangler secret put UPLOAD_TOKEN`, then re-enter it in
  the UI.

## Security notes

These are the properties the project is actually trying to hold, so they are
worth stating plainly:

- **IDs are 128 bits of CSPRNG output**, URL-safe, 22 characters. Image URLs are
  unguessable; that is what makes an unlisted URL safe to paste.
- **Image URLs are public and permanent** until you delete them. Anyone with the
  link can view the image — that is the point — but nothing enumerates them.
- **Listing and deletion require the token.** Only you see the list.
- **The declared content type is ignored.** Uploads are identified by their
  magic bytes, and only PNG, JPEG, GIF, WebP and AVIF are stored. SVG is
  rejected on purpose: it can carry scripts, and images are served from the same
  origin as the UI that holds your token.
- Responses on `/i/*` carry `X-Content-Type-Options: nosniff` and a
  `default-src 'none'; sandbox` CSP.
- The original filename is never used as a storage key, and EXIF is not yet
  stripped — see below.

## Not there yet

v0.1 is deliberately small. Planned next:

- A desktop capture client: hotkey → select region → upload → URL on clipboard.
- EXIF stripping on upload.
- `private` / `unlisted` distinction and expiring URLs.
- Browser extension.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in UPLOAD_TOKEN
npm run db:migrations:apply:local
npm run dev
```

Upload from a shell:

```sh
curl -X POST http://localhost:8787/api/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @screenshot.png
```

## Supporting this

gazoon is free and always self-hosted, so there is nothing to sell you. If it
saves you from paying someone else to hold your screenshots,
[GitHub Sponsors](https://github.com/sponsors/Nkzn) is the way to say thanks.

## License

MIT
