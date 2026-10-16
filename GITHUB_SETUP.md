# Schurr Automations website and CRM

This repository contains the current website and private CRM source exported from approved Site version 111.

- Original source commit: `ee288f6c871af79b6fe65eacfd9cd3adb5468810`
- Export date: October 15, 2026
- Export scope: website and CRM source, backend, database schema and migrations, tests, assets, and approved outreach documents. See `EXPORT_NOTES.md` for the media storage format.

## Project map

- `site-html/`, `public/`, and public `app/` routes: website and demonstrations.
- `app/manage/`, `app/api/manage/`, and `lib/crm*`: protected owner CRM.
- `db/` and `drizzle/`: database schema and migration history.
- `lib/` and API routes: inquiries, appointments, outreach, mailbox and voice integration code.
- `tests/`: server, database, security and interface checks.
- `docs/gmail-setup.md`: current Gmail implementation guidance. Some earlier status paragraphs in `README.md` describe historical setup states.

## Local setup

Use Node.js 22.13 or newer and the package manager version declared in `package.json` (pnpm 11.25.0 at export).

```sh
pnpm install --frozen-lockfile
pnpm build
```

The clean checkout uses the portable execution profile by default. `pnpm install:ci` is a Linux-specific helper requiring `flock` and GNU `timeout`; use the direct install command above on macOS.

Five large images/videos are stored as lossless parts in `source-assets/`. `pnpm build` and `pnpm dev` restore them automatically and verify their original hashes. To restore before inspecting files or running tests, use `node scripts/restore-source-assets.mjs`; no dependencies are required. Keep the parts and `source-assets/manifest.json` with the repository. Changes to a restored media file require updating its stored parts and manifest, or deliberately replacing this backup format with a regular Git blob.

The test suites require a Node version with `node:sqlite`. For core CRM checks after dependencies are installed:

```sh
node tests/crm.test.cjs
node tests/crm-race.test.cjs
node tests/crm-render.test.cjs
```

## Runtime configuration

GitHub stores source. It does not copy hosted database records, platform identity, production secrets, provider credentials, or existing service connections. The current application relies on the Sites authentication boundary, a D1 database binding, applied migrations, and separately configured runtime values. Do not bypass owner authentication to make a new environment appear connected.

The existing `.openai/hosting.json` identifies the current Site and is retained for continuity. Creating this GitHub repository does not change hosting or publish a new website release. Follow the existing review and approval process before any deployment.

Keep `.env*`, `.dev.vars`, credentials, runtime database files, dependency folders and generated builds out of commits. Public-source prospect datasets already used by private imports and tests are retained; no live CRM database was exported.

## Export review

The original snapshot contains 850 tracked files and approximately 43.24 MB of source/assets. The largest individual file is approximately 6.73 MB. A read-only scan found no common credential signatures, private keys, or tracked runtime database dumps. This is a source-transfer check, not a new runtime or provider validation.
