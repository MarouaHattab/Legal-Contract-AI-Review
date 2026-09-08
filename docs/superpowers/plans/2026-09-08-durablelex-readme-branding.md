# DurableLex README Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the public project identity to DurableLex and add professional GitHub and LinkedIn discovery copy without changing application behavior.

**Architecture:** This is a documentation-only update confined to the root `README.md`. Existing workflow names, API routes, source modules, diagrams, and runtime configuration remain unchanged because DurableLex is the portfolio-facing product identity, not an internal code migration.

**Tech Stack:** Markdown, Git, PowerShell verification commands

---

## File structure

- Modify: `README.md` — public project name, tagline, opening positioning, GitHub About text, and discoverability topics.
- Verify only: `assets/diagrams/*.png` — existing diagram assets referenced by the README; no image content changes.

### Task 1: Apply DurableLex portfolio branding

**Files:**
- Modify: `README.md:1-12`
- Verify: `assets/diagrams/01-temporal-system-overview.png`
- Verify: `assets/diagrams/02-contract-parallel-fanout.png`
- Verify: `assets/diagrams/03-human-review-state.png`
- Verify: `assets/diagrams/04-workflow-lifecycle.png`

- [ ] **Step 1: Replace the title, tagline, opening description, and image alternative text**

Use this exact opening identity:

```markdown
# DurableLex — Agentic Contract Intelligence with Temporal

> **Durable, human-governed AI workflows for multi-contract analysis.**

DurableLex is an end-to-end agentic document system built around durable workflows. It converts PDFs into traceable Markdown artifacts, analyzes contracts in parallel, synthesizes cross-document risks with an LLM, and pauses safely for a human reviewer to approve or revise the report.
```

Change the first diagram's alternative text to `DurableLex system overview`. Keep the image path unchanged.

- [ ] **Step 2: Add the GitHub About copy and repository topics near the opening**

Insert this block after the demonstration-client paragraph and before the project links:

```markdown
## GitHub About

Durable human-in-the-loop contract intelligence with Temporal, FastAPI, parallel agentic AI workflows, PDF extraction, and LLM risk synthesis.

**Topics:** `temporal` · `temporal-workflows` · `agentic-ai` · `human-in-the-loop` · `contract-analysis` · `document-intelligence` · `fastapi` · `python` · `llm` · `distributed-systems` · `workflow-orchestration` · `docker` · `postgresql` · `react`
```

- [ ] **Step 3: Verify the product rename is complete and the technology name remains accurate**

Run:

```powershell
rg -n -F "Temporal Contract Review" README.md
rg -n "DurableLex|Temporal" README.md
```

Expected: the first command returns no matches; the second shows DurableLex in the public identity and Temporal throughout the technical architecture.

- [ ] **Step 4: Verify all referenced diagrams still exist**

Run:

```powershell
$files = @(
  'assets/diagrams/01-temporal-system-overview.png',
  'assets/diagrams/02-contract-parallel-fanout.png',
  'assets/diagrams/03-human-review-state.png',
  'assets/diagrams/04-workflow-lifecycle.png'
)
$files | ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "Missing diagram: $_" } }
```

Expected: exit code 0 with no missing-diagram exception.

- [ ] **Step 5: Check formatting and scope**

Run:

```powershell
git diff --check
git diff --name-only
```

Expected: no whitespace errors, and `README.md` is the only implementation file changed.

- [ ] **Step 6: Commit the verified README change**

Run:

```powershell
git add -- README.md
git commit -m "correct README with DurableLex project branding"
```

Expected: one commit containing only `README.md`, with a message that follows the project's required prefix format.
