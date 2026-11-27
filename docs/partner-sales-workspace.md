# Partner sales workspace

## Where to work
- `/sales`: individual rep workspace, with My Leads, Add Operator, and submission receipts.
- `/dashboard/team?tenant=exotiq`: administrator review, team access, account assignments, and baseline summary.
- Existing Exotiq Leads rows also show baseline source labels and registry-managed owners. Managed handoffs go through Team & Intake rather than the old claim dropdown.

## First use
1. Administrator adds each rep's approved email and display name in Team Access. This does not send an invitation.
2. Rep opens `/login?next=/sales`, requests a short-lived link, and uses their own email account. No shared logins or Supabase access. Public signup remains disabled: only an active, admin-approved member can have an unconfirmed auth account prepared at this request. The rep still has to prove email ownership through the link; adding a member does not send an invitation.
3. Rep submits business name plus at least one email, phone or website. Contact name and relationship notes are optional.
4. The server records submitter/team/time, checks current accounts and submissions, and creates a pending receipt. Submission is not acceptance.
5. Administrator reviews the source and identity, chooses an existing match where appropriate, and records an accept/decline reason. Decision notes are visible to the submitting rep.
6. Existing ownership is preserved. Use an explicit handoff with a reason when another rep should work an account.
7. Assigned accounts appear in My Leads. Reps record their next action, follow-up time and outcome note; they cannot change source attribution or take another person's account.

## Private matching and relationship requests

The Add Operator flow now checks business name plus phone, website or email before submission. Unassigned records return only a limited match/workability status, not a contact directory. Lookups are server-scoped, member-bound, expire after 20 minutes, and use persisted per-member quotas (10/minute, 100/hour, 1000/day). Temporary lookup rows are pruned after 24 hours when lookups run; source/relationship history is not deleted.

For an existing operator, the rep chooses **Review by Gregory**, supplies who they know, relationship context and their last conversation, and submits a relationship request. These requests are separate from source registration; the one-accepted-registration constraint stays intact. Pending claims do not transfer ownership. Ambiguous matches can be submitted for identity review instead of silently merged.

The admin Relationship Reviews tab shows candidate accounts, current ownership, recent recorded CRM activity and explicit missing email/WhatsApp/Granola coverage. Private review notes are excluded from rep responses. The admin can request information, decline, or **Approve & Hand Off** with a shared summary, next action, due time, next-action owner and manual external-conversation/outreach clearance. Approval checks a version bound to current lead, assignment, activity and request evidence; stale reviews must refresh.

An approved handoff preserves source, assigns the requesting active rep atomically, places app-controlled outreach on hold and pauses/cancels eligible local sequence work. Protected/suppressed accounts and unresolved in-flight sending block handoff. This does not automatically verify or stop independent activity in external tools; the review checkbox records the administrator's manual clearance.

## Daily work and notifications

Accounts distinguish account owner, next-action owner (`account_owner`, `gregory`, `unassigned`) and founder assistance (`none`, `requested`, `active`). Reps can request founder help and update shared outcomes without changing ownership/source. Current canonical lead status remains the sales progression source of truth; SDRs cannot mark customers won or reopen terminal accounts without admin review.

Recent Shared Outcomes exposes only shared or the rep's own account events, not private founder conversation history. The dashboard shows due follow-ups and open relationship requests older than 24 hours; these are review indicators, not auto-approval or auto-release rules. Notifications are in-app only, recipient-scoped, idempotent per event and limited to the latest 30 visible notices. Marking a notice read persists.

## SDR export boundary

SDRs cannot export any database dataset, including assigned leads. Both the server proxy and export handler independently enforce admin-only export access. Sales requests reject other tenant names/IDs; admin export behavior for authorized workspaces remains unchanged. Denying exports cannot prevent manual copying or screenshots of data legitimately displayed to a rep.

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
3. Review the complete SQL and grants. Existing partner-registry installations receive only additive migration `017_sales_lookup_and_relationship_requests.sql`; a fresh fixture needs the prerequisite schema and migrations 015/016 first. Do not push unrelated migration history or rerun an already-applied 017 blindly.
4. Verify live table/RPC privileges. Attach the snapshot with `python3 scripts/import_sales_baseline.py --snapshot <private-directory>` (dry run), then `--apply` only after approval. The importer verifies hashes, uses an atomic idempotent RPC, and reads every membership back; it never updates canonical leads.
5. Verify the original lead fingerprint and other-tenant count remain unchanged after database work.
6. Publish the reviewed app, verify admin access and denial paths, then onboard actual reps. Local browser fixtures are not production rep-login proof.

## Rollback
Roll the application back to its prior approved commit if necessary. Leave the additive registry/history and baseline intact; do not erase audit evidence. Keep the permissions hardening in place unless a narrowly identified dependency requires a separately reviewed correction. Never restore anonymous exposure as a general rollback shortcut.

## Finance integration boundary
A future private finance workspace may consume a separately authorized, versioned, read-only projection keyed by canonical account, registration, and event IDs. The interactive sales API is not an unattended finance API. Do not share personal session cookies or an unrestricted service-role key, and do not allow finance to silently rewrite sales source or ownership.
