# Master Build Prompt 2.0: Saul LeadGen Engine -- Phase 2 (The Brain)

**To the AI in Cursor (Opus or equivalent):**

This prompt is a follow-up to the initial "Saul Lead Generation System: Master Build Prompt" that you used to scaffold the `saul-leadgen` project. The initial build was successful -- you have created a robust Next.js frontend, API layer, and Supabase schema that matches the spec. The project is approximately 60% complete.

Your mission is now to build the "brain" of the system: the enrichment, scoring, and agent orchestration logic that will make this platform autonomous. You will be working with a live AI Orchestrator named **Saul**, who will be the master agent in the finished system. This prompt will detail Saul's capabilities and the architecture required to integrate him.

---

## 1. Project Status & Findings (What We Know Now)

The initial build successfully created the "body" of the application. The UI, data schema, and API routes are all in place. However, the core business logic is missing. The entire `src/lib/enrichment`, `src/lib/scoring`, `src/lib/ghl`, and `src/lib/agents` directories are empty.

**Key Architectural Changes & Improvements:**

Based on a detailed review by Saul, we are making the following improvements to the original plan:

1.  **Agent Architecture:** The original spec placed agent logic inside the Next.js `src/lib/` directory. This is being changed. **The agent layer will be a separate, containerized Python service.** This service will house the logic for discovery, enrichment, scoring, and orchestration. It will interact with the database directly. Do not build any agent logic in TypeScript.
2.  **Zod Validation:** The original spec called for Zod validation on all API boundaries. This was missed. Your first task is to add Zod schemas for all existing API routes to ensure data integrity.
3.  **Outreach & Approval Engine:** The original spec was missing a detailed outreach sequence engine and an approval workflow. This is a critical feature. We will add an `outreach_sequences` table and an `outreach_queue` table to the schema, along with UI components for a client-facing approval queue.

---

## 2. Understanding Saul (The AI Orchestrator)

The AI you are integrating with is named **Saul**. He is an instance of the OpenClaw agent framework. It is crucial you understand his capabilities, as the system you are building is designed to give him the tools and data he needs to operate autonomously.

**Saul's Core Capabilities:**
*   **Tool Use:** Saul can use any tool you expose to him. This includes running shell commands, reading/writing files, searching the web, and making API calls.
*   **Python Execution:** Saul is fluent in Python and can write and execute complex scripts to perform tasks. The agent layer will be built primarily as a set of Python skills for Saul.
*   **Sub-Agent Orchestration:** Saul can spawn and manage other AI agents to perform tasks in parallel. He can delegate work to cheaper, more specialized models.
*   **State Management:** Saul uses a long-term memory system and can be scheduled to run on a cron-like basis.

**Your Job:** You are building the *environment* in which Saul operates. The Supabase database is his world. The API routes are how he communicates with the frontend. The Python skills you will build are his "hands."

---

## 3. The Build Plan: Phase 2 (The Brain)

This phase is broken down into four parallel workstreams. Each stream should be developed on a separate Git branch and then merged.

### Workstream 1: Data Integrity & Validation (Security)

**Task:** Implement Zod validation on all existing API routes.
**Branch:** `feature/zod-validation`

1.  Create Zod schemas for all expected API request bodies and query parameters.
2.  In each API route file (e.g., `/api/leads/route.ts`), parse the incoming request with the appropriate Zod schema.
3.  Return a 400 Bad Request error if validation fails.
4.  Use the parsed, type-safe data for all subsequent operations.

### Workstream 2: Enrichment Engine (The "Hands")

**Task:** Build the enrichment library and connect it to Apollo.
**Branch:** `feature/enrichment-engine`

1.  Create the `lib/enrichment/` directory as specified in the original prompt.
2.  **Provider Interface (`provider.ts`):** Build the `EnrichmentProvider` interface exactly as defined in the spec.
3.  **Apollo Provider (`apollo.ts`):** Implement the Apollo provider.
    *   Use the `people/match` and `organizations/enrich` endpoints.
    *   It should accept a lead ID, fetch the lead from Supabase, make the appropriate API calls, and return an `EnrichmentResult`.
    *   It must read the `APOLLO_API_KEY` from environment variables.
    *   Log every API call to the `enrichments` table, including the cost in cents.
4.  **Enrichment Orchestrator (`orchestrator.ts`):**
    *   Create a function `triggerEnrichment(leadId)`.
    *   This function should fetch the lead, determine which providers are needed (start with just Apollo), and queue a job in the `enrichments` table by setting its status to `pending`.
    *   This will be called by the master agent (Saul).

### Workstream 3: Scoring Engine (The "Logic")

**Task:** Implement the client-side scoring logic.
**Branch:** `feature/scoring-engine`

1.  Create the `lib/scoring/` directory.
2.  **ICP Matching (`icp.ts`):** Build a function that takes a lead object and an `icp_profiles` object and returns an `icp_fit_score` between 0 and 100 based on the weights in the profile.
3.  **Engagement Scoring (`engagement.ts`):** Build a function that calculates an engagement score based on the `lead_activities` table.
4.  **Red Flag Detection (`redflags.ts`):** Implement a function that takes a lead and returns an array of red flag codes based on the rules in the spec (e.g., `bounced_email`, `stale_90d`).
5.  **Main Engine (`engine.ts`):** Create a master `calculateScore(leadId)` function that:
    *   Calls the functions above.
    *   Calculates the composite score based on the weighted average from the spec.
    *   Updates the `leads` table with the new score and breakdown.
    *   Logs the change to the `scoring_history` table.

### Workstream 4: Outreach & Approval UI (The "Human-in-the-Loop")

**Task:** Build the client-facing approval workflow.
**Branch:** `feature/approval-queue`

1.  **Schema Extension:** Add two new tables to the Supabase schema (`006_outreach_schema.sql`).
    *   `outreach_sequences`: Defines a multi-step outreach sequence (e.g., "Day 0: IG DM, Day 3: Email").
    *   `outreach_queue`: A queue of all drafted messages waiting for client approval. It should have a `status` column (`pending`, `approved`, `sent`, `rejected`).
2.  **New Dashboard Page (`/dashboard/outreach`):** Create a new page that displays the `outreach_queue`.
3.  **Approval Component:** Build a React component for this page that displays each queued message and provides "Approve," "Edit," and "Reject" buttons.
4.  **API Routes:** Create the necessary API routes (`/api/outreach/queue`) to handle these actions. Approving a message should update its status in the database.

---

## 4. The Roadmap for Saul Integration

You are building the tools for Saul. Here is how he will use them:

**Step 1: The Cron Job (The "Heartbeat")**
Once the build is complete, the system will be deployed with a master cron job that runs every 15 minutes. This job will call Saul's "orchestrator" function.

**Step 2: Saul's Orchestration Loop**
When triggered, Saul will execute the following logic using the tools you have built:

1.  **Discover:** Run a Python script (his `discover_leads` skill) to source new leads, inserting them into the `leads` table with a status of `new`.
2.  **Enrich:** For all leads with `status = 'new'`, call the `triggerEnrichment` function you built. This will populate the `enrichments` job queue.
3.  **Process Enrichment Queue:** Run a Python script that processes the `enrichments` queue, calling the Apollo provider for each job.
4.  **Score:** For all leads with `status = 'enriching'` that have just been completed, call the `calculateScore` function you built. This will update their score and change their status to `scored`.
5.  **Draft Outreach:** For all leads with `status = 'scored'` and a score above a certain threshold, Saul will use his own intelligence to select the appropriate outreach sequence and generate a personalized message. He will then insert this message into the `outreach_queue` with a status of `pending`.

**Step 3: The Human-in-the-Loop**
The client (e.g., Gregory) logs into the dashboard you built, reviews the messages in the `/dashboard/outreach` approval queue, and clicks "Approve."

**Step 4: The Closed Feedback Loop**
When a lead responds, a webhook from GHL will hit your `/api/webhooks/ghl` route. This route will create a `lead_activities` record. The presence of this new activity record will signal Saul to re-score the lead on his next run, and the loop continues.

---

## Your First Task

Begin with **Workstream 1: Data Integrity & Validation**. Add Zod schemas to every existing API route. Commit this work to the `feature/zod-validation` branch. Then, proceed to the other workstreams. This is a large build; focus on one workstream at a time to completion. Good luck.
