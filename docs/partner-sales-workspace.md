# Partner sales workspace

## Where to work
- `/sales`: individual rep workspace, with My Leads, Add Operator, and submission receipts.
- `/dashboard/team?tenant=exotiq`: administrator review, team access, account assignments, and baseline summary.
- Existing Exotiq Leads rows also show baseline source labels and registry-managed owners. Managed handoffs go through Team & Intake rather than the old claim dropdown.

## First use
1. Administrator adds each rep's approved email and display name in Team Access. This does not send an invitation.
2. Rep opens `/login?next=/sales`, requests a short-lived link, and uses their own email account. No shared logins or Supabase access.
3. Rep submits business name plus at least one email, phone or website. Contact name and relationship notes are optional.
4. The server records submitter/team/time, checks current accounts and submissions, and creates a pending receipt. Submission is not acceptance.
5. Administrator reviews the source and identity, chooses an existing match where appropriate, and records an accept/decline reason. Decision notes are visible to the submitting rep.
6. Existing ownership is preserved. Use an explicit handoff with a reason when another rep should work an account.
7. Assigned accounts appear in My Leads. Reps record their next action, follow-up time and outcome note; they cannot change source attribution or take another person's account.

## Source labels
- **Exotiq existing:** present in the verified baseline without a flagged source signal.
- **Review source:** baseline contains a possible conflicting source/relationship signal requiring human review.
- **Partner submitted:** a newly created canonical account came through accepted partner intake.
- **Source not reviewed:** no baseline/partner classification has been established by this workflow.

These are operational labels, not determinations of compensation or contractual entitlement. Original lead source and relationship history remain intact. Baseline and registration histories are append-only. This workspace contains no private agreement or financial calculations.

## Permissions and privacy
The existing admin allowlist stays privileged. Active, verified-email partner members receive only the dedicated sales workspace/API; legacy dashboards/APIs remain admin-only. New registry tables/RPCs are inaccessible to ordinary browser database roles and are reached through scoped server endpoints. Foreign tenant parameters are rejected. Direct access to legacy owner-privileged database views/functions is revoked while trusted server access remains.

No email/WhatsApp/Granola synchronization is implied by this release. Those channels require their own permissioned integration and coverage verification. This release adds no outreach automation, GHL mirroring, payments, or automatic financial eligibility.

## Release gates
1. Verify a private, complete Exotiq snapshot and keep raw records outside Git.
2. Run unit/database-fixture tests, typecheck, targeted lint, production build, and desktop/mobile browser regressions.
3. Review source and apply only migrations 015 and 016, in order. Do not push unrelated migration history.
4. Verify live table/RPC privileges. Attach the snapshot with `python3 scripts/import_sales_baseline.py --snapshot <private-directory>` (dry run), then `--apply` only after approval. The importer verifies hashes, uses an atomic idempotent RPC, and reads every membership back; it never updates canonical leads.
5. Verify the original lead fingerprint and other-tenant count remain unchanged after database work.
6. Publish the reviewed app, verify admin access and denial paths, then onboard actual reps. Local browser fixtures are not production rep-login proof.

## Rollback
Roll the application back to its prior approved commit if necessary. Leave the additive registry/history and baseline intact; do not erase audit evidence. Keep the permissions hardening in place unless a narrowly identified dependency requires a separately reviewed correction. Never restore anonymous exposure as a general rollback shortcut.

## Finance integration boundary
A future private finance workspace may consume a separately authorized, versioned, read-only projection keyed by canonical account, registration, and event IDs. The interactive sales API is not an unattended finance API. Do not share personal session cookies or an unrestricted service-role key, and do not allow finance to silently rewrite sales source or ownership.
