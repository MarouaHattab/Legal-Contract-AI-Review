# Temporal-first AI Contract Review

An agentic document-processing system built to demonstrate durable execution with [Temporal](https://temporal.io/), not just a chat interface.

The system accepts PDF contracts, converts them into durable Markdown artifacts, analyzes documents in parallel, synthesizes a risk report with an LLM, and then pauses for a real human decision. A reviewer can approve the report or request a revision without losing workflow state. If a worker, API process, or container restarts, Temporal remains the source of truth for the workflow.

The React application is intentionally a thin demonstration client. The engineering focus is the Temporal architecture behind it: workflow orchestration, child workflows, activity isolation, retries, heartbeats, durable waiting, and human-in-the-loop updates.

## Why this project exists

Long-running AI document jobs are a poor fit for a single HTTP request. A contract review may need to:

- download and process multiple documents;
- call external storage and an LLM provider;
- retry transient failures without duplicating artifacts;
- report progress while work is still running;
- preserve partial document outcomes;
- wait hours or days for a reviewer;
- resume revision work from durable state.

This project treats those requirements as a workflow-design problem. FastAPI starts and observes work, but Temporal owns the execution history and the state transitions.

## What the system demonstrates

| Capability | Implementation | Why it matters |
| --- | --- | --- |
| Durable orchestration | Temporal Python workflows | Progress survives process and container restarts |
| Parallel fan-out | One child workflow per contract PDF | Documents can be processed independently and concurrently |
| Activity isolation | Separate orchestration, document, and LLM workers | Slow or failure-prone integrations do not block workflow tasks |
| Resilience | Retry policies and non-retryable validation errors | Transient failures retry; bad inputs fail clearly |
| Progress visibility | Workflow Queries and activity heartbeats | The API and UI can show meaningful stages without guessing |
| Human-in-the-loop | Temporal Signal and Update handlers | Review decisions are durable workflow events, not ad-hoc flags |
| Agentic synthesis | OpenRouter-backed analysis, synthesis, and revision activities | The LLM is one activity inside a controlled, auditable process |
| Artifact lineage | S3-compatible PDF and Markdown objects with SHA-256 metadata | Results can be traced back to their source documents |
| Operational packaging | Docker Compose health checks and service dependencies | The complete system can be started as one local stack |

## Architecture at a glance

~~~text
                         starts / observes
  Reviewer or client  ───────────────────────▶  FastAPI :8000
                                                        │
                                                        │ Temporal SDK
                                                        ▼
                  PostgreSQL ◀──── Temporal :7233 ─── task queues
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  │                                                │
        PDFPipelineWorkflow                         ContractReviewWorkflow
                  │                                                │
        convert PDF → Markdown                       start N child workflows
                  │                                                │
        PDF orchestration worker                 PDFSummaryWorkflow × N
                  │                                                │
                  ▼                                                ▼
           PDF document worker                         contract document worker
           S3 download/upload                          S3 download/extraction
                                                                    │
                                                                    ▼
                                                           contract LLM worker
                                                   analyze → synthesize → revise
                                                                    │
                                      waits durably for approve / revise update

  S3-compatible object storage ◀──── PDF and Markdown artifacts
  OpenRouter                    ◀──── analysis, synthesis, and revision calls
  React/Vite demo client        ───── browser presentation layer only
~~~

The diagram above is intentionally text-based so the repository remains readable without a diagram renderer. The full image-generation prompts are included at the end of this README.

## Two workflow paths

### 1. PDF extraction pipeline

The standalone PDF path is useful when a document needs to become a durable Markdown artifact before any contract analysis happens.

~~~text
POST /process_pdf/start
        │
        ▼
PDFPipelineWorkflow on pdf-pipeline-queue
        │
        └── convert_pdf_to_markdown activity
              ├── download source PDF from S3-compatible storage
              ├── extract text with PyMuPDF
              ├── write a derived Markdown object
              └── return output URI, SHA-256, size, and content type
~~~

The workflow has a separate document task queue, uses a bounded retry policy, and refuses unsafe or invalid output keys. The API returns a workflow ID immediately for the start endpoint; the result endpoint reads the completed Temporal result.

### 2. Contract review agent

The contract path is the main agentic workflow. It is a parent workflow with one child workflow per source PDF.

~~~text
POST /contract-review/start
        │
        ▼
ContractReviewWorkflow on contract-review-queue
        │
        ├── start child: PDFSummaryWorkflow(contract 1)
        ├── start child: PDFSummaryWorkflow(contract 2)
        └── start child: PDFSummaryWorkflow(contract N)
                │
                ├── extract_contract_artifact activity
                └── analyze_contract_artifact activity
        │
        └── synthesize_contract_report activity
                │
                ▼
        durable awaiting_review state
                │
        ┌───────┴────────┐
        │                │
     approve          revise(feedback)
        │                │
   completed       revise_contract_report
                         │
                         └── return to awaiting_review
~~~

Each child has its own Temporal history. The parent aggregates successful and failed document outcomes, records whether the report is complete or partial, and then synthesizes the consolidated report.

## Human-in-the-loop design

Human review is modeled as workflow state, not as a web-server session:

1. The parent workflow sets its phase to <code>awaiting_review</code>.
2. <code>workflow.wait_condition</code> suspends execution while consuming no worker compute.
3. The API exposes the current state through a Temporal Query.
4. Reviewer assignment is recorded with a Temporal Signal.
5. Approval or revision is submitted with a validated Temporal Update.
6. The Update validator rejects stale revisions, missing reviewers, invalid decisions, or feedback-free revisions.
7. Approval completes the workflow; revision runs the LLM revision activity and returns to the same durable review state.
8. A configurable maximum revision count prevents an unbounded review loop.

This is the important distinction from a conventional background task: the reviewer can respond much later, while the workflow still has a durable, inspectable state and a complete event history.

## Reliability and failure handling

- Temporal retries transient activity failures with exponential backoff.
- Invalid PDF inputs and unsafe output keys are marked non-retryable so the system does not waste attempts on bad data.
- Long PDF extraction and LLM operations heartbeat progress to Temporal.
- Each document is isolated as a child workflow; one failed document is represented in the report instead of erasing the other results.
- The API has liveness and readiness endpoints and reports Temporal unavailability as a service error.
- S3 artifacts are content-addressed with SHA-256 and are never silently overwritten by a source PDF.
- LLM settings entered through the API are process-local overlays and are not written into Temporal history.
- Docker Compose waits for PostgreSQL, Temporal, and API health before starting dependent services.

## Repository map

~~~text
.
├── compose.yaml
├── README.md
├── apps/
│   ├── client-app/              FastAPI API and S3 artifact/upload services
│   ├── ai-contract-review/      Parent/child workflows and contract activities
│   ├── pdf-extraction/         Standalone PDF workflow and conversion activity
│   └── react-app/              Thin React/Vite demonstration client
└── setup/samples-server/       Temporal development configuration and UI assets
~~~

### Temporal task queues

| Queue | Worker responsibility |
| --- | --- |
| <code>pdf-pipeline-queue</code> | Start and run the standalone PDF workflow |
| <code>pdf-document-processing-queue</code> | Download, extract, and upload PDF Markdown artifacts |
| <code>contract-review-queue</code> | Run the contract parent and PDF child workflow logic |
| <code>contract-document-processing-queue</code> | Extract contract text and durable Markdown artifacts |
| <code>contract-llm-queue</code> | Analyze documents, synthesize reports, and revise reports |

## API surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /health | Process liveness |
| GET | /health/live | Container liveness |
| GET | /health/ready | Temporal readiness check |
| POST | /uploads/pdfs | Validate and upload one or more local PDFs |
| POST | /process_pdf/start | Start a standalone PDF workflow |
| GET | /process_pdf/{workflow_id}/status | Query PDF phase and completion state |
| GET | /process_pdf/{workflow_id}/result | Read generated Markdown artifact metadata |
| POST | /contract-review/start | Start a multi-document contract review |
| GET | /contract-review/{workflow_id}/status | Query phases, documents, reviewer, and completeness |
| GET | /contract-review/{workflow_id}/report | Read an in-flight report through a Query |
| GET | /contract-review/{workflow_id}/result | Read a terminal report result |
| POST | /contract-review/{workflow_id}/assign | Signal the reviewer assignment |
| POST | /contract-review/{workflow_id}/decision | Submit an approve/revise Update |
| GET | /artifacts/markdown?uri=... | Preview or download a Markdown artifact |
| GET | /workflows | List PDF and contract workflow executions |
| GET | /settings | Read safe operational settings metadata |
| POST | /settings/llm/test | Probe an LLM provider without storing the key |

## Run locally with Docker Compose

### Prerequisites

- Docker Desktop with Compose v2
- An S3-compatible bucket and credentials
- An OpenRouter-compatible API key and model

### Configure secrets

Copy the example environment files and fill in local values. Never commit real credentials:

~~~powershell
Copy-Item apps/ai-contract-review/.env.example apps/ai-contract-review/.env
Copy-Item apps/pdf-extraction/.env.example apps/pdf-extraction/.env
Copy-Item apps/client-app/.env.example apps/client-app/.env
~~~

The Compose file overrides container-to-container routing with <code>TEMPORAL_HOST=temporal:7233</code>. Keep example files safe to share and put credentials only in ignored <code>.env</code> files or a secret manager.

### Start the stack

~~~powershell
docker compose up --build -d
docker compose ps
~~~

Available local services:

| Service | URL |
| --- | --- |
| Demo client | http://localhost:8501 |
| FastAPI docs | http://localhost:8000/docs |
| FastAPI readiness | http://localhost:8000/health/ready |
| Temporal UI | http://localhost:8080 |
| Temporal gRPC | localhost:7233 |

If the browser shows an older demo client after a frontend change, rebuild the web image explicitly:

~~~powershell
docker compose build web
docker compose up -d web
~~~

This matters because the production web container copies a compiled Vite bundle into Nginx; it does not mount the source tree for live updates.

### Stop the stack

~~~powershell
docker compose down
~~~

The PostgreSQL volume is named <code>temporal-postgresql-data</code> and is retained unless you explicitly remove it.

## Development checks

Frontend type-check and production build:

~~~powershell
Set-Location apps/react-app
npm run build
~~~

The package also exposes an `npm test` script for frontend tests when test files are present. Python services are packaged independently in their own Docker images. Use Compose health checks and Temporal UI to validate the running stack, then exercise the API with the OpenAPI page or the demo client.

## Portfolio takeaways

This project is a practical example of:

- choosing a workflow engine for AI tasks that outlive a request/response cycle;
- separating deterministic orchestration from side-effecting activities;
- scaling document work with child workflows instead of one large history;
- using Temporal Queries, Signals, and Updates as explicit application contracts;
- designing human review as a durable state transition;
- making partial success and retry behavior visible to the user;
- packaging API, workers, Temporal, PostgreSQL, and the demo client as one reproducible stack.

### LinkedIn-ready summary

> Built a Temporal-first AI contract review platform in Python. The system fans out multi-document PDF processing into durable child workflows, uses heartbeating and retryable activities for S3 and LLM integrations, synthesizes a consolidated risk report, and pauses safely for human approval or revision through Temporal Updates. FastAPI exposes the workflow API, Docker Compose packages the stack, and React provides a lightweight demonstration client.

## Demo video

Add your walkthrough recording at <code>assets/temporal-contract-review-demo.mp4</code> and link it here:

[Watch the complete Temporal workflow demo](assets/temporal-contract-review-demo.mp4)

For the strongest portfolio story, record a short sequence that shows:

1. uploading two PDFs;
2. the API returning a workflow ID immediately;
3. Temporal workers processing child workflows in parallel;
4. document progress and generated Markdown artifacts;
5. LLM report synthesis;
6. the workflow waiting for human review;
7. a reviewer assigning themselves and requesting a revision;
8. the revised report returning to review;
9. final approval and the durable completed result.

## Diagram prompts for README visuals

Generate the diagrams below with ChatGPT image generation, then save the exported PNG or SVG files under <code>docs/diagrams/</code>. These prompts deliberately produce an Excalidraw/Miro workshop-board style instead of a glossy SaaS illustration.

### Shared visual direction

Prefix every prompt with:

~~~text
Create a clean hand-drawn systems architecture diagram that looks made by a thoughtful human in Excalidraw or Miro: warm-white paper canvas, dark navy marker outlines, slightly imperfect rounded rectangles and arrows, limited flat colors, generous whitespace, clear hierarchy, and short readable labels. Use navy/blue for Temporal and API boundaries, green for workers and activities, amber for task queues and durable state, purple for external services, and a small coral accent only for failures or review decisions. Use a consistent handwritten-style sans-serif font, but keep all technical labels legible. No 3D, no gradients, no photorealism, no stock icons, no glossy SaaS dashboard, no Mermaid syntax, no code screenshot, no fake terminal window, no decorative cloud clutter, and no invented components. Generate a 16:9 landscape image at 1800–2200 pixels wide. Keep every label inside its shape and leave generous margins.
~~~

### 1. Temporal system overview

~~~text
Draw the high-level architecture for an AI contract review system called “Temporal-first AI Contract Review”. Put Temporal Server at the center inside a large navy outlined boundary, with PostgreSQL below it as durable persistence. On the left, show FastAPI :8000 and a small browser box labelled “React demo client”. On the right, show “PDF extraction workers” and “Contract review workers”.

Inside the contract worker group, show “parent workflow”, “child workflow × N”, “document activities”, and “LLM activities”. Outside the Temporal boundary, show “S3-compatible storage” and “OpenRouter”. Draw arrows for client → FastAPI, FastAPI → Temporal, Temporal → task queues, workers ↔ Temporal, document activities ↔ S3, LLM activities ↔ OpenRouter, and results → FastAPI → client. Add the callout: “Temporal owns durable state, retries, timers, and human review waiting.”
~~~

### 2. Durable PDF extraction pipeline

~~~text
Draw a left-to-right workflow titled “PDFPipelineWorkflow — durable PDF to Markdown”. Show six numbered nodes: “PDF URI received”, “workflow started”, “Temporal task queue”, “convert_pdf_to_markdown activity”, “Markdown artifact uploaded”, and “workflow result returned”.

Show FastAPI on the far left, Temporal Server and pdf-pipeline-queue in the middle, and the PDF document worker on the right. Attach S3-compatible storage to the conversion activity. Annotate the activity with “download”, “PyMuPDF extraction”, “SHA-256”, “safe derived key”, and “retry policy”. Add the note “invalid PDF / unsafe output key → non-retryable failure”. Emphasize that FastAPI starts the workflow and does not perform PDF processing.
~~~

### 3. Parallel contract fan-out

~~~text
Draw “ContractReviewWorkflow — fan-out into isolated child workflows”. Place a parent workflow box in the center. Draw three parallel arrows to green cards labelled “PDFSummaryWorkflow — contract 1”, “PDFSummaryWorkflow — contract 2”, and “PDFSummaryWorkflow — contract N”.

Inside every child card show “extract_contract_artifact” and “analyze_contract_artifact”, then return “DocumentOutcome” objects to the parent. Below the parent show “completeness = complete | partial | failed”. On the left show “N S3 PDF paths” entering through FastAPI and Temporal. On the right show “synthesize_contract_report”. Add the callout: “Each child has its own event history; one failed document does not erase the others.” Include the queue labels contract-review-queue, contract-document-processing-queue, and contract-llm-queue.
~~~

### 4. Retries and heartbeats

~~~text
Create a close-up explainer titled “Why the activities are durable”. Show a Temporal workflow box connected to an activity worker. Split a long PDF or LLM operation into handwritten checkpoints. Draw dotted heartbeat arrows back to Temporal labelled “stage”, “page range”, and “characters processed”.

Above the activity draw a retry timeline with “attempt 1”, “2s”, “attempt 2”, “4s”, “attempt 3”, and “up to 60s”. Show a green branch labelled “transient network / provider error → retry” and a coral branch labelled “invalid PDF / unsafe output key → non-retryable”. Add: “The worker may restart; Temporal still knows what happened.”
~~~

### 5. Human-in-the-loop state

~~~text
Draw a state-machine diagram titled “Human review is durable workflow state”. Put awaiting_review in a large amber rounded rectangle with the note “workflow.wait_condition — zero worker compute while waiting”.

From the left show “GET status / report” as a blue Temporal Query arrow. From above show “assign reviewer” as a green Temporal Signal arrow. From the right show a reviewer decision card with “approve” going to “approved / completed” and “revise + feedback” going to “revise_contract_report activity”. Loop the revision state back to awaiting_review with “revision_count + 1”.

Add a validator checklist: “reviewer assigned”, “expected revision matches”, “decision valid”, “feedback required for revise”, and “max revisions enforced”. Make it obvious that a reviewer may respond much later without losing workflow state.
~~~

### 6. Complete portfolio story

~~~text
Create one polished architecture board titled “Temporal-first AI Contract Review — complete execution story”. Use five horizontal zones: “Client”, “API”, “Temporal”, “Workers”, and “External services”.

Client contains “browser / React demo”. API contains “FastAPI :8000” and “start, status, report, decision”. Temporal contains “Temporal Server :7233”, “PostgreSQL”, and the five task queues. Workers contain “PDFPipelineWorkflow”, “ContractReviewWorkflow”, “PDFSummaryWorkflow × N”, “document workers”, and “LLM workers”. External services contain “S3-compatible storage” and “OpenRouter”.

Use numbered arrows: (1) upload or provide PDF paths, (2) start workflow, (3) Temporal dispatches work, (4) child workflows process documents in parallel, (5) activities heartbeat and retry, (6) LLM synthesizes the report, (7) workflow pauses for human review, (8) approve or revise, (9) durable result returns to the client. Add the callout: “The interface is replaceable; the workflow guarantees are the product.”
~~~

### Diagram quality checklist

- Temporal Server is visually central rather than the React client.
- Parent and child workflow boundaries are obvious.
- Queues, workers, and external services are readable.
- The durable human-review wait and approve/revise loop are visible.
- No credentials, fake endpoints, invented queues, or generic AI brain icons appear.
- Text remains readable at README width.
- Arrows have one clear direction and do not cross unnecessarily.
- Use consistent colors and line weight across all diagrams.

Suggested filenames:

~~~text
docs/diagrams/01-temporal-system-overview.png
docs/diagrams/02-pdf-pipeline.png
docs/diagrams/03-contract-fanout.png
docs/diagrams/04-retries-and-heartbeats.png
docs/diagrams/05-human-review-state.png
docs/diagrams/06-complete-execution-story.png
~~~

For a LinkedIn carousel, export the same six diagrams as 1600×900 PNGs and use the overview, fan-out, human-review, and complete-story images as the strongest four slides.
