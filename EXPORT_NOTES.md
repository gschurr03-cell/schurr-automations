# GitHub export scope

This repository contains the complete website and CRM source backup from approved Site version 111, original commit `ee288f6c871af79b6fe65eacfd9cd3adb5468810`. The owner explicitly approved including the remaining website assets and outreach documents on October 15, 2026. All originally pending files are included, either directly or in the lossless media format below.

## Large media

The GitHub connector stalled on direct large-file transfer. Five original images/videos are therefore stored as 84 base64 parts in `source-assets/`, with exact sizes, SHA-256 hashes and original Git blob hashes in `source-assets/manifest.json`. These are original bytes, not recompressed or regenerated media.

`node scripts/restore-source-assets.mjs` recreates the five original public paths. It requires only Node, verifies every restored file against both hashes, skips matching existing files, and refuses to overwrite differing local edits. `pnpm dev` and `pnpm build` run it automatically. The restored files are ignored by Git because their durable source is already tracked in the parts.

The original application code is unchanged. GitHub-only changes are the media restore helper and its dev/build package-script hooks, five ignore rules for restored files, this document, the setup guide, and a README setup link. Database schema, migration history and existing tests are retained.

## Documents and runtime data

Public PDF briefs, restore archives and the outreach kit are included. The outreach kit contains an internal offer/pricing reference. Keep this repository private; share only selected public collateral with prospects.

No live CRM database, runtime secrets, passwords or provider credentials were exported. Schema snapshots describe tables and columns, not live records. Existing public-source business prospect fixtures required by imports and tests are retained. Runtime connections, hosted data and platform authentication remain separate from this source backup.

Creating this repository did not deploy or change the live website.
