<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git and shipping

- **Remote:** `exotiq-ai/lead-gen-saul` (GitHub), default branch `main`. Keep local `main` in sync with a normal commit workflow, then `git pull --rebase origin main` if the remote has moved, then `git push origin main`.
- **Convenience:** `npm run git:push-main` runs rebase on `main` and pushes (use only when you are ready to update `main` and have no local-only work you still need to keep unmerged).
- **Hooks (once per clone):** `npm run setup:git-hooks` registers this repo’s `.githooks` with Git. The **pre-push** hook runs `npm run typecheck` so broken TypeScript does not reach the remote. To push anyway: `git push --no-verify`.
- **ESLint:** `npm run lint` (full-project lint is still being tightened; the hook uses **typecheck** only so pushes stay unblocked by known style warnings in charts and elsewhere).

