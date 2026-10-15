# Working fictional handoff test

This kit proves a bounded backend path using the unchanged application’s `readVoiceEvent`, `captureVoiceLead` and `mutateCrm` functions. A signed **synthetic call event**, not a spoken phone call, creates a real on-disk inquiry and callback task. A separately labelled local inbox adapter saves a test notification. Restarting the CLI or reloading the optional local server reads the same SQLite records.

It has no production database, provider secrets, external network calls, connected salesperson accounts or real message delivery. Every buyer, vehicle and staff identity is fictional. The source runtime ignores ambient provider credentials and fails closed if a library tries a network call. Existing production owner-alert outbox records remain pending inside this isolated database; they are never sent. The separate test inbox is not an email provider.

| Component | What is exercised |
| --- | --- |
| Event authentication and inquiry capture | Unchanged `lib/voice-intake.ts` against the local database |
| Durable staff task and mutation deduplication | Unchanged `lib/crm.ts` against the local database |
| Fictional salesperson selection and unavailable-person fallback | Explicit test-fixture orchestration in `runtime.cjs`; no production staff directory or routing connection |
| Test notification | A local SQLite inbox adapter, not the production email-delivery adapter |
| Staff display | Test-only view of saved records, not a production CRM deployment |

This demonstrates working persistence and recovery with transparent adapter boundaries. It does not certify an end-to-end phone-to-employee installation.

## Run from the existing repository

Use Node 22.13 or newer and the repository’s installed TypeScript dependency. No extra packages are required.

```bash
node docs/dealer-demo-kit/test-environment/run.cjs run normal
node docs/dealer-demo-kit/test-environment/run.cjs inspect
node docs/dealer-demo-kit/test-environment/run.cjs export
```

The first command writes a fictional callback task and local notification. `inspect` opens the database in a new process. `export` rereads the database and creates `.runtime/staff-view.html` plus `.runtime/staff-view.json`. Open the HTML for a readable recording snapshot. Reloading the exported HTML alone does not reread the database; run `export` again first.

Runtime files stay in the ignored `.runtime` directory. They are not public assets and must not be copied into the Site’s `public` directory or committed. To keep a separate rehearsal, append `--state /absolute/path/to/an/empty/test-directory`. Existing directories without this kit’s marker are rejected. Do not point it at another application’s data.

## Record the interactive version on your computer

```bash
node docs/dealer-demo-kit/test-environment/run.cjs serve
```

Open `http://127.0.0.1:4287`. This optional server binds only to loopback, accepts only same-origin fixture forms, and cannot send messages or accept arbitrary customer details. It was prepared but **not started or browser-tested in the managed Sites environment**. Stop it with Ctrl-C.

1. Say: “This is a fictional dealership in an isolated test environment. I’m submitting a test inquiry, not placing a live phone call.”
2. Choose **normal**. Show Alex Morgan, Stock D214, the requested 3–4 p.m. window, Jordan Lee’s callback task and its saved reference.
3. Choose **Reload saved records**. The handler rereads SQLite. The task and local notice remain present.
4. Show the local test inbox and say: “This notification is saved in a local simulated inbox. We still need to test the actual delivery channel for a client.”
5. Choose **staff unavailable** or **task write failure** and show the explicit fallback. An unavailable salesperson routes the test callback to Taylor Example, the fictional duty manager. A failed task write says no callback or visit is secured.
6. For the failed write, choose **Retry this test handoff**. The same inquiry receives one callback task; the earlier exception remains in the local inbox history.

The task title records the responsible fictional person. This is not a connected staff account, real live transfer or verified staff acceptance. The buyer is not marked contacted, the vehicle is not marked available, and no visit is booked.

## Failure demonstrations from the CLI

```bash
node docs/dealer-demo-kit/test-environment/run.cjs run staff-unavailable
node docs/dealer-demo-kit/test-environment/run.cjs run task-write-failure
node docs/dealer-demo-kit/test-environment/run.cjs retry task-write-failure
node docs/dealer-demo-kit/test-environment/run.cjs run notification-failure
node docs/dealer-demo-kit/test-environment/run.cjs retry notification-failure
node docs/dealer-demo-kit/test-environment/run.cjs export
```

Scenarios use fixed event references. Repeating one recovers the same task and notice rather than creating duplicates. The task-write failure is injected into the actual CRM transaction adapter; its mutation receipt rolls back with the task. The captured inquiry remains visible, and only an exception notification goes to the local duty-manager inbox. The notification-failure case saves the task but creates no inbox notice until an explicit retry.

## Evidence and limits

Run `node tests/dealer-demo-kit.test.cjs`. The test uses separate Node processes and a temporary on-disk SQLite database, checks restart persistence and duplicates, tests both failures, then removes that test database. It writes `verification.json` with the tested source hashes and limitations.

Verified here: signed synthetic event validation; actual intake/task persistence; reload by new process; fictional callback assignment recorded in task text; local inbox persistence; unavailable-person fallback; task-write rollback; notification failure and duplicate-safe retry.

**Not tested:** actual spoken test call, voice quality, phone routing, a real salesperson account, email/SMS arrival, live transfer, inventory integration, browser recording, or a physical QR scan. Do not describe this as a fully connected live receptionist installation. Keep the public scripted example labelled simulated. A real call and real delivery check need an explicitly approved isolated provider setup and a permitted test recipient.
