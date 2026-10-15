# Repeatable client implementation

The agency CRM and Schurr's live services stay separate from prepared client workspaces.

1. Open Automation Desk → Client setups. Create the business brief, select offers, and approve public facts, staff-only knowledge and prices separately.
2. Run the selected template test pack. Website-only work includes the shared inquiry reply and staff alert workflow.
3. Save Installation details: the separate client origin, deployment reference, database reference, approved operator account and sender address. Add optional provider references when known. Keys and passwords belong only in the client deployment's secret store.
4. Download the preparation package. It is private business configuration, not a deployment archive. Use the matching maintained source checkout:

   ```sh
   node scripts/prepare-client.cjs --config /path/client-preparation.json --output /new/client-workspace
   ```

5. Review the new workspace's `IMPLEMENTATION.txt` and `private/receipt.json`. The compiler produces source with client identity, a simple approved-facts website, inquiry form and approved-answer assistant, empty local database verification, inactive settings and seed SQL. It refuses existing outputs, source overlap, changed packages and mismatched source. It makes no network calls.
6. Provision the client's own hosting, database and accounts. The saved references do not prove ownership or create resources. Configure fresh secrets, apply migrations to an empty client database, seed approved settings, then build and deploy using the hosting provider's supported workflow.
7. Connect only the scoped services. Verify email delivery/replies, phone routing and greeting, permission/duplicate/stop behavior, booking and unavailable staff, failure recovery and actual monitoring. Review generated public content and privacy before publishing.
8. Record real evidence in the client's Launch checks and obtain scoped approval. Changing the business brief or saved installation invalidates previous checks. Launch approval is evidence, not an activation switch.

## Scope and limits

Reusable code covers intake/CRM, voice capture, native appointments, staff callback tasks, email outboxes, review invitation eligibility and approved sending, quote drafts, approved-source answers, source-page SEO checks, search CSV reporting and monitoring. Each installation starts without copied contacts, leads, provider connections or runtime secrets. Booking, handoff, public chat, customer email and monitoring notifications start disabled.

External calendar synchronization, live call transfer, SMS, unattended follow-up sequences, inbox reply synchronization, Google API retrieval/publication and arbitrary application writes are separate adapters. Selecting their scope does not implement or activate them. All shared runtime modules remain in source; scope selects preparation/monitoring expectations, not an authorization boundary.

The current generated public site is a functional starter. Custom visual design and embedding intake into an existing external website require client-specific work. The agency outreach interface is excluded. The assistant is installed but starts disabled; enable approved answers only after checking the public FAQ. Customer confirmation and review invitation replies use the approved customer-reply inbox; staff alerts use the separate alert inbox.

## Maintaining the compiler

After changing the maintained source, regenerate the source manifest with `node scripts/build-client-source-manifest.cjs`. Packages carry that reviewed source fingerprint; download again after an update. Do not disable the matching check to use an old package against new code. Run the installation, source preparation and generated-form tests. Build a fictional generated workspace when changing compiler adaptation or runtime dependencies.

Migration 0023's expression indexes and origin-alias triggers are reviewed SQL; the installed schema generator does not correctly quote those expression indexes. Preserve their valid SQL when generating later migrations. Installation targets are intentionally excluded from operational recovery archives; launch evidence is restored stale. Record the current installation references separately and reverify access after recovery.
