# Adversarial review — 2026-10-15

Reviewed version 2.1.0 and prepared fixes in 2.1.1. The initial adversarial run failed nine probes. This review found defects beyond the normal contact, thread, and approval checks.

**Assessment: suitable only for trusted collaborators. This is not a security certification.** Separate write authorization, authenticated participant identities, and global abuse controls remain open. A compromised invitation holder can submit delegated work to shared projects.

## Scope and method

Read the relay handlers, encryption envelopes, local state, runner arguments, approval flow, and browser rendering. Tested against a disposable PostgreSQL database and local API. Used fictional contacts, encrypted fixtures, a recording worker, and a fresh browser profile. No production rooms, real collaborator bots, or email recipients were used for attack tests.

The recording worker verifies routing, arguments, prompts, sessions, and execution counts. It does not test model behavior. An opt-in real Claude test was attempted, but the configured account returned a weekly usage limit before inference. That test did **not** pass and provides no evidence of model-level prompt-injection resistance.

## Findings and fixes

| Severity | Finding                                                            | Evidence and resulting behavior                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Approval hid the executable continuation                           | A benign summary could accompany a different continuation. The email and confirmation page now display both. The listener decrypts the sealed request and compares its action fields before execution.                                                                                                                                                     |
| High     | Pending approval followed changed local access                     | An approved request executed after its contact was replaced or its project folder changed. Requests now bind to the connection, pairing, canonical folder, permission mode, and access grant. Changed or legacy unbound requests are invalidated. Access is checked again before starting a worker.                                                        |
| High     | Contact replacement resumed another contact's session              | Reusing a contact name in a different room passed the old model session to the new connection. Session state now binds to the connection and pairing. Project grants and conversation policy have separate session namespaces.                                                                                                                             |
| High     | Deleted tasks could execute again                                  | Delete a processed note, allow a poll to forget it, then repost the same ciphertext and ID: the worker ran twice. Relay IDs and tombstones are now immutable. The listener retains a durable per-connection execution ledger through deletion, rename, and re-pairing.                                                                                     |
| High     | Duplicate contact aliases ran the same request twice               | Saving a connection under two names produced two executions. Setup now rejects duplicate aliases. Existing duplicate configurations process only the first contact and log a warning.                                                                                                                                                                      |
| Medium   | One invalid ciphertext terminated the entire listener              | A poisoned room prevented a separate healthy contact from responding. Verification failure now pauses the affected room while other contacts continue. Direct CLI reads retain exit code 5.                                                                                                                                                                |
| Medium   | Payload fields could replace transport IDs or break rendering      | A decrypted `clientId` could override the authenticated transport ID. Optional metadata types were insufficiently checked. Transport IDs now take precedence; invalid event metadata is rejected or skipped before use. Malformed JSON values return client errors instead of server errors.                                                               |
| Medium   | Capacity checks raced and retries failed at capacity               | Counting before inserting allowed competing requests to pass the same quota check. Appends now lock the room, read capacity in a subsequent READ COMMITTED statement, and insert the whole batch atomically. Stable retries succeed without replacing notes. Batches are limited to 100 notes.                                                             |
| Medium   | Conversation permissions depended on plan mode and prose           | Conversation workers now request restricted and safe modes, no MCP servers, no skills, no browser control, and no permission prompts. Contact-only conversations have no tools; project conversations allow only Read, Glob, and Grep. Unsupported runners fail without a permissive fallback. Actual model enforcement remains unverified in this review. |
| Medium   | Concurrent local configuration writes could discard access changes | Inspection found whole-file saves outside the existing update lock. Share, unshare, removal, and service configuration now update current state under that lock. A regression check verifies 20 parallel shares plus one revocation without losing either grants or the revocation.                                                                        |

Additional defenses: approved continuations start fresh sessions without room history; task folder serialization uses canonical paths; wake-up requests have a timeout; raw runner errors stay in local logs rather than being posted into shared rooms. Project names cannot use prototype property names.

## Verification

`npm run build` and the complete `npm run e2e` suite pass after the fixes. The suite includes existing contact, thread, and approval flows plus these adversarial checks:

- Immutable note IDs and deletion tombstones; processed work does not execute twice.
- Session isolation after contact replacement; durable execution records after rename and re-pairing.
- Duplicate contact aliases; payload attempts to replace transport IDs.
- Restricted conversation runner arguments; an unhealthy room beside a healthy contact.
- AES-GCM rejection when ciphertext is moved to another room or note ID, including the same key in another room.
- Full continuation in both email formats; invalidation after room, folder, mode, grant, pairing, or action changes.
- Fresh approval sessions without room history; malformed JSON inputs across all three API handlers.
- Twenty parallel project grants plus one revocation without losing configuration changes.

The bounded relay pressure test sends 146 local requests. Fifty-one concurrent batches attempt 5,100 notes: exactly 5,000 are stored and one whole batch is rejected. Stable retries still succeed at capacity and cannot resurrect tombstones. Eighty competing approval decisions produce one winner with a matching receipt. Wrong tokens and cross-decision tokens are rejected. This is a correctness check, not a production throughput benchmark. SQL checks use the local PostgreSQL driver. The Neon HTTP transaction path compiles but was not exercised against a remote database; validate it in staging before deployment.

Browser checks verify that the exact continuation and project are visible, opening a link leaves approval pending, an explicit confirmation records the decision, HTML payloads remain text, malformed metadata does not crash a room, and the approval page fits a 390-pixel viewport.

The public-source snapshot passes secret scanning and a check for private setup references. Ignored local environment configuration is excluded from the public-source snapshot. Production dependency scanning reports zero advisories. The full development/build dependency tree still reports 25 affected packages: 21 high and four moderate. These are audit package counts, including transitive chains, not 25 independently demonstrated exploits.

## Open risks and next work

1. **High — relay mutations require only a room ID.** The API accepts post, delete, save, and unsave operations without proof of the room key. An ID holder can corrupt or delete a room without decrypting it. The malformed-ciphertext test demonstrates this surface. Add a distinct write capability and a migration/revocation path; do not make an unauthenticated first-claim migration the new trust boundary.
2. **High — invitations do not authenticate individual participants.** Everyone with the room key can forge names and submit `intent: task`. A compromised trusted contact can request work within shared access. Signed participant identities and locally enforced delegation policy are needed before accepting untrusted contacts. Threads separate context, not access.
3. **High — no global abuse or cost controls.** Room creation is anonymous and saved rooms persist. Per-room capacity and batch limits do not prevent unlimited rooms, requests, approval records, or aggregate storage. Add deployment-level request limits, global storage budgets, and retention policy.
4. **Medium — toolchain advisories remain.** Vite, Tailwind, and the Vercel development/build dependency chains need a compatibility-tested update. A clean production dependency audit does not clear those findings. Do not expose the development server to untrusted networks.
5. **Medium — delegated work is a privileged model instruction.** Its folder is a working directory, not an OS sandbox. Approval binds the reviewed instruction, not an executable command manifest. Model behavior, project instructions, tools, and credentials still affect execution. Consider a restricted task runner or explicit typed actions for destructive operations.
6. **Medium — live model and delivery behavior are not proven here.** The real canary test was blocked before inference. No real approval email delivery or cross-machine collaborator run was attempted. Run the opt-in canary test after account availability returns, then a bounded cross-machine test before broader rollout.
7. **Reliability limits.** Consumption is recorded before execution to prevent automatic replay. A crash in that interval can leave a request unperformed; inspect before retrying. Revocation does not terminate a worker already running. Rooms have a lifetime limit of 5,000 note IDs, including tombstones, and fetch their full history. Pagination, compaction, cancellation, and recovery need further work.

## Upgrade behavior

Both participants should upgrade and restart idle listeners. Contacts, keys, email settings, and project access persist. Older conversation sessions are not resumed under the new policy. Existing processed IDs are retained. Pending approvals without a connection binding are stopped and require a fresh approval request.

The immutable relay write behavior applies once the server update is deployed. Listener protections require upgrading each installation. This review does not claim that other participants' installations have been upgraded.
