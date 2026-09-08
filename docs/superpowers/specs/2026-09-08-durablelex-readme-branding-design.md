# DurableLex README Branding Design

## Objective

Rename the project from **Temporal Contract Review** to **DurableLex** and position it as a professional portfolio project for GitHub and LinkedIn. The branding must emphasize the system's real technical strengths: Temporal workflow orchestration, durable execution, agentic contract analysis, parallel document processing, and human-in-the-loop review.

## Approved identity

- Product name: **DurableLex**
- README title: **DurableLex — Agentic Contract Intelligence with Temporal**
- Short tagline: **Durable, human-governed AI workflows for multi-contract analysis.**

The product name is concise and brandable. The subtitle carries the searchable technical and domain terms without making the name itself long or generic.

## README changes

1. Replace the old project name in the title, opening description, image alternative text, and any narrative references that identify the system.
2. Preserve references to Temporal when they describe the orchestration technology rather than the old product name.
3. Add a concise **GitHub About** section near the beginning of the README with copy suitable for the repository description:

   > DurableLex is a human-in-the-loop contract intelligence system built with Temporal, FastAPI, and agentic AI. It orchestrates durable PDF extraction, parallel multi-contract analysis, LLM-powered risk synthesis, and reviewer-controlled approval or revision workflows.

4. Add a discoverability line containing relevant portfolio keywords without keyword stuffing.
5. Keep React positioned as a demonstration client rather than the project's core achievement.
6. Preserve all existing architecture explanations, diagrams, setup instructions, and demo links.

## GitHub repository metadata copy

Recommended GitHub About description:

> Durable human-in-the-loop contract intelligence with Temporal, FastAPI, parallel agentic AI workflows, PDF extraction, and LLM risk synthesis.

Recommended GitHub topics:

- `temporal`
- `temporal-workflows`
- `agentic-ai`
- `human-in-the-loop`
- `contract-analysis`
- `document-intelligence`
- `fastapi`
- `python`
- `llm`
- `distributed-systems`
- `workflow-orchestration`
- `docker`
- `postgresql`
- `react`

## LinkedIn positioning

Recommended project title:

> DurableLex | Agentic Contract Intelligence with Temporal

Recommended opening description:

> Built DurableLex, an end-to-end contract intelligence system that uses Temporal to orchestrate durable, failure-aware AI workflows. The platform extracts PDFs into traceable artifacts, analyzes multiple contracts in parallel, synthesizes cross-document risks with an LLM, and keeps final decisions under human control through persistent approve-and-revise workflows.

## Scope boundaries

- Documentation-only change.
- Do not rename source packages, workflow types, task queues, API routes, containers, or environment variables.
- Do not edit frontend or backend behavior.
- Do not regenerate or alter the existing diagrams.
- Do not claim legal advice, production readiness, benchmark results, or capabilities that the repository does not implement.

## Verification

- Confirm every old product-name occurrence in `README.md` is intentionally replaced.
- Confirm all four diagram paths still resolve.
- Run `git diff --check`.
- Commit only the README branding and portfolio-copy changes after verification.
