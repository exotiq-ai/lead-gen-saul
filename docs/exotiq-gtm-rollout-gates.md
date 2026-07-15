# Exotiq GTM rollout gates

## Phase 0: safety hardening

- [ ] Use clean worktree/branch for GTM changes.
- [ ] `OUTREACH_MUTATIONS_ENABLED` remains `false` until admin token is installed.
- [ ] Queue mutation endpoints require an admin bearer token.
- [ ] Dry-runs never mark queue rows as `sent`.
- [ ] Send attempts and events have durable ledgers.
- [ ] GHL webhook verifies `X-GHL-Signature` with the current Ed25519 public key.
- [ ] Unknown or wrong-location GHL webhook events are quarantined.
- [ ] Hard bounce, complaint, and unsubscribe create active suppressions.

## Phase 1: US founder-call motion

- [ ] Country gate is US only.
- [ ] UK/GB is planned as phase 2 but disabled.
- [ ] Tier 1 / Score 5 / 25+ fleets route `call_only_gregory`.
- [ ] Offer is a 15-minute founder call.
- [ ] First-touch copy uses one pain hypothesis and at least three research signals.
- [ ] From name: `Gregory Ringler | Exotiq`.
- [x] Primary sending identity: `gregory@outreach.exotiq.ai` through Resend.
- [x] Reserve sending identity: `gregory@connect.exotiq.ai` through Resend.
- [ ] Reply-To: `hello@exotiq.ai`.
- [ ] Physical address: `1001 S Main St #6709, Kalispell, MT 59901`.

## Phase 3 controlled sending gate

Do not enable until all are true:

- [ ] GHL location readback confirms Exotiq Inc.
- [ ] DNS alignment passes for exact From domain.
- [ ] Gmail, Outlook, and iCloud seed tests pass with headers inspected.
- [ ] Reply exits sequence.
- [ ] Unsubscribe exits sequence and creates suppression.
- [ ] Bounce/complaint exits sequence and creates suppression.
- [ ] Booking/opportunity exits sequence.
- [ ] Duplicate-send/idempotency test passes.
- [ ] Gregory explicitly approves first batch size and daily cap.
