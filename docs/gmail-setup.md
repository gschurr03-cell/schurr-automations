# Business Gmail connection

The public website uses gavin@schurrautomations.com for email and (985) 232-8337 for direct calls or texts. The AI receptionist demo remains (985) 771-0552.

## One-time Google setup

1. Sign into Google Cloud with the Schurr Workspace account and choose an organization-owned project. Enable the Gmail API.
2. Configure Google Auth Platform for an **Internal** audience, limited to the Schurr Workspace organization. Supply the business app name, support email, homepage, and privacy page. This connection is for the business mailbox only; client organizations need their own configuration.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI:

   `https://schurrautomations.com/api/manage/gmail/callback`

4. Open **CRM → Mailbox** on the canonical business website. Paste the client ID and secret into the protected setup form. Do not put the secret in chat, source code, or a public page. Saving a new configuration disconnects an earlier connection.
5. Click **Connect Gmail**, select **gavin@schurrautomations.com**, and allow sending and reading email. The connection rejects a different mailbox or incomplete permissions. This authorizes the mailbox; the CRM still uses its existing ChatGPT owner login.
6. Confirm the Mailbox screen shows the exact address as connected. For an end-to-end test, prepare and approve a message to an address you control, inspect its exact recipient and content in Mailbox, and explicitly confirm sending. Check receipt in that inbox, reply to it, then click **Check replies** and confirm the reply appears and pending outreach stops.

## What is connected

- Every Gmail message requires an individually approved outreach draft and a separate explicit send confirmation. Connecting Gmail, approving a draft, exporting, refreshing, and checking replies never send messages.
- The approved sender must equal the connected mailbox and have a business mailing address. Existing daily limits and the saved Mountain Time sending window apply.
- **Submitted to Gmail** means the provider accepted the request, not that the recipient received it.
- An uncertain send is retained and cannot be automatically sent again. **Check saved result** searches the Sent mailbox for the exact immutable message. An empty search does not prove that sending failed.
- Reply checks inspect only Gmail conversations for messages sent through this CRM. Earlier manual emails and Resend inquiry confirmations are not automatically matched. They keep their existing workflow.
- A matching reply stops pending outreach for that contact. Explicit opt-outs also enter the suppression list. Attachments are not fetched; HTML-only replies are recorded without importing their HTML body.
- Disconnect removes stored mailbox tokens locally. Historical messages remain. Removing this app's grant from Google is a separate Google Account action.

## Optional scheduled reply checks

Manual checks and mandatory pre-send reply checks are available after connection. A background schedule is **not active by default**.

A scheduler can POST an empty JSON object to `/api/gmail/sync` with `Content-Type: application/json` and `Authorization: Bearer <GMAIL_SYNC_RUNNER_SECRET>`. Configure a random secret of at least 32 characters as a protected runtime value and store the same value securely in the scheduler. The endpoint only checks replies; it never sends mail. Credential configuration alone does not establish a running schedule.

Checks are bounded to ten tracked threads and forty provider reads per run; repeated runs continue from the oldest checked threads. A failed or incomplete recipient check blocks another send. All Gmail credentials are encrypted and excluded from operational backups. Restoring operational history preserves attempted-send receipts and disables pending sends.

## Reviewed batches

Outreach selects up to 20 fresh, reviewed businesses. Generate returns the exact saved draft IDs. The batch view shows recipient, subject, body and footer for each; every draft must be reviewed before the explicit batch confirmation. Default delivery is five messages per group, with 45 minutes between completed groups. The owner may choose 30 or 60 minutes.

Confirmation freezes the exact reviewed MIME in D1 and creates a durable queue; it does not itself call Gmail. Only confirmed queue items can be dispatched. While Outreach is open, the owner-authenticated queue panel checks every 30 seconds and advances one due group. Closing the page stops future checks; an already processing group may finish. There is no connected unattended scheduler.

A future scheduler can POST an empty JSON object to `/api/gmail/queue` with `Content-Type: application/json` and `Authorization: Bearer <GMAIL_QUEUE_RUNNER_SECRET>`. The dedicated random secret must be at least 32 characters and is not configured by this update. Never reuse owner sessions, Gmail tokens or the separate reply-sync secret. The endpoint cannot create batches, change recipients or edit messages. Enabling a secret alone does not establish a schedule.

Each dispatch rechecks reply state, suppression, sender/connection revisions, sending hours and daily capacity. Timed groups share the 20-attempt daily ceiling with individually sent and manually recorded outreach. Missed checks cannot cause several groups to burst at once. Uncertain sends pause the queue and retain first-attempt evidence; check Sent, then cancel the remainder and review unsent messages again. Cancellation cannot recall submitted emails.

The Sent page combines immutable Gmail attempt history and manually recorded sends. Fresh Outreach excludes prior contact by prospect ID or normalized email, across campaigns, plus live queue reservations. Follow-ups are deliberately prepared from Sent → Open business → Prepare a follow-up and still require source eligibility, sequence delay and a new review.

Queue history is included in operational backups. Restored queues are cancelled, leases cleared, and Gmail connections omitted.
