# GitHub export scope

This initial export contains the website and CRM source code from approved Site version 111, commit `ee288f6c871af79b6fe65eacfd9cd3adb5468810`. Application source code is unchanged. Setup and export notes were added for this repository.

## Pending assets

Automatic approval review blocked attaching binary media, downloadable documents and restore archives to the repository. It judged the asset/document disclosure to require explicit authorization beyond the code-transfer request. The initial export therefore contains code and text assets, including SVG, but does not include binary assets or the outreach collateral folder.

The exact pending paths, original Git blob hashes and sizes are listed in `EXPORT_PENDING_ASSETS.json`. They include images, three videos, two font files, public service-brief PDFs, source/schema restore archives, and outreach documents including an internal offer/pricing reference. No blocked asset was attached to the branch through another encoding or route.

This is a source-code backup with incomplete assets, not a standalone deployment archive. Restore the pending assets before deploying solely from this checkout. Source references to those original assets are retained. The existing live website was not redeployed or changed, and the complete original source/assets remain saved with the Site.

## Runtime data

No live CRM database, runtime secrets, passwords or provider credentials were exported. Schema snapshots describe tables and columns, not live records. Existing public-source business prospect fixtures required by source imports and tests are retained. Runtime connections and hosted data remain separate from this GitHub source snapshot.
