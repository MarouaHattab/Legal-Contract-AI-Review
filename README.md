# DurableLex — Agentic Contract Intelligence with Temporal

> **Durable, human-governed AI workflows for multi-contract analysis.**

DurableLex is an end-to-end agentic document system built around durable workflows. It converts PDFs into traceable Markdown artifacts, analyzes contracts in parallel, synthesizes cross-document risks with an LLM, and pauses safely for a human reviewer to approve or revise the report.

The browser interface is a demonstration client. The core of the project is the Temporal architecture: deterministic orchestration, isolated activities, child workflows, retries, heartbeats, Queries, Signals, Updates, and durable human-in-the-loop state.

## GitHub About

Durable human-in-the-loop contract intelligence with Temporal, FastAPI, parallel agentic AI workflows, PDF extraction, and LLM risk synthesis.

**Topics:** `temporal` · `temporal-workflows` · `agentic-ai` · `human-in-the-loop` · `contract-analysis` · `document-intelligence` · `fastapi` · `python` · `llm` · `distributed-systems` · `workflow-orchestration` · `docker` · `postgresql` · `react`

**Video demo** → [demo Video](assets/temporal-contract-review-demo.mp4) · **Demo client** → [localhost:8501](http://localhost:8501) · **Temporal UI** → [localhost:8080](http://localhost:8080) · **FastAPI docs** → [localhost:8000/docs](http://localhost:8000/docs)

<p align="center">
  <img src="assets/diagrams/01-temporal-system-overview.png" width="100%" alt="DurableLex system overview"/>
</p>

## Why this matters

AI document processing is rarely one reliable API call. A real review may run for minutes, process several files, call storage and model providers, fail partially, retry transient errors, and wait hours or days for a person.

A conventional web request or in-memory background task makes that lifecycle fragile. If the process restarts, the application must reconstruct progress and decide what can safely run again. This project delegates those guarantees to Temporal. FastAPI starts and observes workflows; Temporal owns execution history and state transitions; workers perform the side effects.

## Project at a glance

| Area | Implementation |
| --- | --- |
| Primary use case | Multi-document contract analysis with human approval or revision |
| Orchestration | Temporal Python SDK with parent and child workflows |
| API | FastAPI endpoints for uploads, workflow control, status, artifacts, and settings |
| Document processing | PyMuPDF extraction into durable Markdown artifacts |
| Agentic layer | OpenRouter analysis, cross-contract synthesis, and feedback-driven revision |
| Storage | S3-compatible PDF and Markdown objects with SHA-256 metadata |
| Human review | Temporal Query, Signal, Update, validator, and durable wait condition |
| Persistence | Temporal backed by PostgreSQL |
| Deployment | Ten Docker Compose services with health-based startup dependencies |
| Demo | React/Vite client served by Nginx; Temporal UI for execution inspection |

## What I built

- Implemented a standalone <code>PDFPipelineWorkflow</code> that validates an S3 PDF path, delegates conversion to a document worker, and returns durable Markdown artifact metadata.
- Implemented <code>ContractReviewWorkflow</code> as a parent workflow that fans out one <code>PDFSummaryWorkflow</code> child for each contract.
- Separated workflow orchestration, document extraction, and LLM calls across five worker services and five task queues.
- Added activity heartbeats, exponential retry policies, bounded timeouts, and non-retryable application errors for invalid input.
- Preserved per-document outcomes so partial success can still produce a consolidated report.
- Added LLM activities for document analysis, cross-contract synthesis, and revision from reviewer feedback.
- Modeled reviewer assignment with a Temporal Signal and approve/revise decisions with a validated Temporal Update.
- Added FastAPI endpoints for asynchronous workflow start, status, reports, results, artifact access, and workflow visibility.
- Packaged PostgreSQL, Temporal, Temporal UI, API, workers, and the demo client in one Docker Compose stack.
- Built a demonstration interface for multi-file upload, S3 input, automatic status polling, workflow inspection, report review, and operational settings.

---

## Demo

The project walkthrough should show both the user experience and the workflow history behind it.

[Watch the demo video](assets/temporal-contract-review-demo.mp4)

Recommended recording sequence:

1. Upload two PDF contracts or enter two S3 paths.
2. Start PDF extraction and show that FastAPI returns workflow IDs.
3. Open Temporal UI and show queue dispatch and worker execution.
4. Show the generated Markdown artifacts and per-document progress.
5. Start the contract review and show the parent creating child workflows.
6. Wait for the consolidated report and assign a reviewer.
7. Submit revision feedback and show the report return to human review.
8. Approve the revision and inspect the completed Temporal result.

---

## Architecture

The system has two workflow paths. The first turns one PDF into a durable Markdown artifact. The second coordinates multi-document analysis and a human review loop. Both use the same API, Temporal cluster, PostgreSQL persistence, and S3-compatible storage.

### System boundaries

FastAPI is an entry point, not the workflow engine. It validates requests, starts Temporal executions, exposes workflow state, and translates Temporal errors into HTTP responses. Temporal stores workflow history in PostgreSQL and dispatches workflow or activity tasks to the correct queue. Workers own computation and external I/O.

| Component | Responsibility |
| --- | --- |
| React demo client | Presents uploads, progress, reports, review controls, and settings |
| FastAPI | Validates requests and communicates with Temporal and S3 |
| Temporal Server | Persists event history, schedules tasks, applies retries, and delivers interactions |
| PostgreSQL | Stores Temporal’s durable cluster state |
| Workflow workers | Run deterministic orchestration code |
| Document workers | Download PDFs, extract text, write Markdown, and heartbeat progress |
| LLM worker | Analyze contracts, synthesize reports, and apply reviewer revisions |
| S3-compatible storage | Store source PDFs and derived Markdown artifacts |
| OpenRouter | Provide hosted LLM inference |
| Temporal UI | Inspect workflow histories, task failures, retries, and current state |

### Task queues and worker isolation

| Task queue | Worker | Work executed |
| --- | --- | --- |
| <code>pdf-pipeline-queue</code> | PDF workflow worker | <code>PDFPipelineWorkflow</code> |
| <code>pdf-document-processing-queue</code> | PDF document worker | <code>convert_pdf_to_markdown</code> |
| <code>contract-review-queue</code> | Contract workflow worker | Parent and child workflow logic |
| <code>contract-document-processing-queue</code> | Contract document worker | <code>extract_contract_artifact</code> |
| <code>contract-llm-queue</code> | Contract LLM worker | Analyze, synthesize, and revise activities |

This split keeps slow PDF parsing and network-bound LLM calls away from deterministic workflow execution. Each category can be scaled or constrained independently.

---

## PDF extraction workflow

The standalone PDF path creates a durable text artifact before contract analysis.

1. FastAPI accepts a local PDF upload or an existing <code>s3://bucket/key.pdf</code> URI.
2. Upload validation checks the filename, MIME type, PDF signature, file size, and SHA-256.
3. FastAPI starts <code>PDFPipelineWorkflow</code> on <code>pdf-pipeline-queue</code>.
4. The workflow schedules <code>convert_pdf_to_markdown</code> on the document queue.
5. The activity downloads the PDF, extracts its text, and uploads a derived Markdown object.
6. The activity refuses to overwrite the source key.
7. The workflow returns the Markdown URI, SHA-256, size, and content type.
8. The API exposes status and result endpoints so callers do not hold an HTTP request open.

Document errors such as an invalid PDF or unsafe output key are non-retryable. Transient S3 failures use bounded retries.

---

## Contract review workflow

A parent workflow coordinates all documents and owns the final report lifecycle.

<p align="center">
  <img src="assets/diagrams/02-contract-parallel-fanout.png" width="100%" alt="ContractReviewWorkflow fan-out into parallel PDFSummaryWorkflow children"/>
</p>

### 1. Parallel document analysis

For every source PDF, the parent starts one <code>PDFSummaryWorkflow</code> child. The children run concurrently with <code>asyncio.gather</code>.

Each child:

1. reuses an existing Markdown artifact when aligned artifact metadata is supplied;
2. otherwise schedules <code>extract_contract_artifact</code>;
3. schedules <code>analyze_contract_artifact</code> on the LLM queue;
4. returns the summary, key risks, chunk count, character count, and artifact reference.

Each child has an isolated event history. A failed document becomes a failed <code>DocumentOutcome</code>; it does not erase successful results from other children.

The parent calculates one of three completeness states:

| Completeness | Meaning |
| --- | --- |
| <code>complete</code> | Every contract was processed successfully |
| <code>partial</code> | At least one contract succeeded and at least one failed |
| <code>failed</code> | No contract produced a usable analysis |

### 2. Cross-contract synthesis

When at least one child succeeds, the parent schedules <code>synthesize_contract_report</code>. The LLM receives the successful document outcomes and produces three explicit fields:

| Report field | Content |
| --- | --- |
| <code>overall_risk_level</code> | Consolidated risk rating and explanation |
| <code>top_cross_contract_risks</code> | Risks that span or compound across documents |
| <code>recommended_actions</code> | Concrete next steps for the reviewer |

The LLM is not allowed to control the workflow. It returns structured analysis to deterministic orchestration code, which decides the next state.

### 3. Human review

<p align="center">
  <img src="assets/diagrams/03-human-review-state.png" width="100%" alt="Durable human review state with Temporal Query, Signal, and Update"/>
</p>

The parent enters <code>awaiting_review</code> and calls <code>workflow.wait_condition</code>. No worker thread remains occupied while the workflow waits.

Three Temporal interaction types have distinct responsibilities:

| Interaction | Project use |
| --- | --- |
| Query | Read phase, reviewer, completeness, document progress, and report |
| Signal | Assign or change the reviewer asynchronously |
| Update | Submit an approve or revise decision and receive validation feedback |

The Update validator rejects a decision when:

- the workflow is not awaiting review;
- no reviewer has been assigned;
- another decision is already pending;
- the expected revision is stale;
- the decision is neither approve nor revise;
- revision feedback is empty.

Approval completes the workflow. Revision schedules <code>revise_contract_report</code>, increments the revision number, and returns to <code>awaiting_review</code>. The workflow allows up to ten revisions and uses a three-day timeout for each review cycle.

### Complete execution story

<p align="center">
  <img src="assets/diagrams/04-workflow-lifecycle.png" width="100%" alt="End-to-end workflow from PDF upload to approved report"/>
</p>

This lifecycle is the central engineering idea: the interface may reconnect or disappear, but Temporal continues to own the truth about execution.

---

## Reliability model

| Failure or risk | Design response |
| --- | --- |
| Worker or container restarts | Temporal replays workflow history and redispatches unfinished tasks |
| Temporary S3 or LLM failure | Activity retry policy with exponential backoff |
| Invalid PDF or unsafe key | Typed non-retryable application error |
| Long document operation | Heartbeats report progress and detect stalled activities |
| One contract fails | Child isolation preserves other document outcomes |
| Duplicate review click | Update validation rejects a pending or stale decision |
| Reviewer returns later | Durable wait condition preserves workflow state without worker compute |
| API restarts | Workflow state remains in Temporal, not FastAPI memory |
| Source/result confusion | Derived artifact keys never reuse the source PDF key |
| Secret exposure | Credentials stay in ignored environment files; API responses expose only safe metadata |

### Retry and timeout choices

- Document activities start with a two-second retry interval and allow three attempts.
- LLM activities start with a ten-second retry interval and allow four attempts.
- Retry delays use exponential backoff with bounded maximum intervals.
- Contract extraction heartbeats every 30 seconds.
- LLM analysis, synthesis, and revision use 180-second heartbeat timeouts.
- Workflow and activity schedule-to-close timeouts bound total execution time.
- Invalid input types are explicitly excluded from retry.

---

## API

### Health and operations

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | <code>/health</code> | Basic process health |
| GET | <code>/health/live</code> | Container liveness |
| GET | <code>/health/ready</code> | Temporal connectivity and readiness |
| GET | <code>/workflows</code> | List PDF and contract workflow executions |
| GET | <code>/settings</code> | Return safe operational configuration |
| PUT | <code>/settings/llm</code> | Apply process-local LLM settings |
| POST | <code>/settings/llm/test</code> | Test provider credentials and model visibility |

### PDFs and artifacts

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | <code>/uploads/pdfs</code> | Validate and upload one or more PDFs |
| POST | <code>/process_pdf/start</code> | Start PDF conversion asynchronously |
| POST | <code>/process_pdf/execute</code> | Execute PDF conversion and wait for its result |
| GET | <code>/process_pdf/{workflow_id}/status</code> | Read workflow execution and phase |
| GET | <code>/process_pdf/{workflow_id}/result</code> | Read terminal Markdown artifact metadata |
| GET | <code>/artifacts/markdown?uri=...</code> | Preview or download a Markdown artifact |

### Contract review

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | <code>/contract-review/start</code> | Start multi-document review |
| GET | <code>/contract-review/{workflow_id}/status</code> | Query phase, documents, reviewer, and completeness |
| GET | <code>/contract-review/{workflow_id}/report</code> | Query the current in-flight report |
| GET | <code>/contract-review/{workflow_id}/result</code> | Read the terminal workflow result |
| POST | <code>/contract-review/{workflow_id}/assign</code> | Signal reviewer assignment |
| POST | <code>/contract-review/{workflow_id}/decision</code> | Submit a validated approve or revise Update |

Interactive request and response schemas are available through FastAPI at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Run the project

### Prerequisites

- Docker Desktop with Compose v2
- An S3-compatible bucket
- S3 access credentials
- An OpenRouter API key and model

### 1. Configure environment files

From the repository root:

~~~powershell
Copy-Item apps/ai-contract-review/.env.example apps/ai-contract-review/.env
Copy-Item apps/pdf-extraction/.env.example apps/pdf-extraction/.env
Copy-Item apps/client-app/.env.example apps/client-app/.env
~~~

Configure these categories without committing real secrets:

| Setting | Purpose |
| --- | --- |
| <code>AWS_ACCESS_KEY_ID</code> / <code>AWS_SECRET_ACCESS_KEY</code> | S3-compatible authentication |
| <code>AWS_REGION</code> / <code>AWS_S3_ENDPOINT_URL</code> | Storage endpoint |
| <code>S3_BUCKET</code> | Source and derived artifact bucket |
| <code>OPENROUTER_API_KEY</code> | LLM provider authentication |
| <code>OPENROUTER_MODEL</code> / <code>BASE_URL</code> | Model and provider endpoint |
| <code>TEMPORAL_HOST</code> / <code>TEMPORAL_NAMESPACE</code> | Temporal connection |

Docker Compose overrides inter-container Temporal routing with <code>temporal:7233</code>.

### 2. Start the complete stack

~~~powershell
docker compose up --build -d
docker compose ps
~~~

| Service | Address |
| --- | --- |
| Demo client | http://localhost:8501 |
| FastAPI | http://localhost:8000 |
| FastAPI OpenAPI | http://localhost:8000/docs |
| Temporal UI | http://localhost:8080 |
| Temporal gRPC | localhost:7233 |

All ten services should become running; PostgreSQL, Temporal, API, and web expose Compose health checks.

### 3. Follow worker execution

~~~powershell
docker compose logs -f contract-workflow-worker contract-document-worker contract-llm-worker
~~~

Use Temporal UI to inspect child workflows, activity attempts, histories, Queries, Signals, and Updates.

### 4. Rebuild a stale demo client

The Nginx container serves a compiled Vite bundle and does not mount the source tree.

~~~powershell
docker compose build web
docker compose up -d web
~~~

### 5. Stop the stack

~~~powershell
docker compose down
~~~

The PostgreSQL volume is retained. Removing volumes is a separate destructive operation.

---

## Example contract review request

Start a review with one to twenty unique PDF URIs:

~~~bash
curl -X POST http://localhost:8000/contract-review/start \
  -H "Content-Type: application/json" \
  -d '{
    "s3_paths": [
      "s3://your-bucket/contracts/master-services-agreement.pdf",
      "s3://your-bucket/contracts/security-addendum.pdf"
    ],
    "max_revisions": 2
  }'
~~~

The API returns immediately:

~~~json
{
  "workflow_id": "contract-review-generated-id"
}
~~~

Check progress and the current report:

~~~bash
curl http://localhost:8000/contract-review/contract-review-generated-id/status
curl http://localhost:8000/contract-review/contract-review-generated-id/report
~~~

Assign a reviewer:

~~~bash
curl -X POST http://localhost:8000/contract-review/contract-review-generated-id/assign \
  -H "Content-Type: application/json" \
  -d '{"name":"Reviewer"}'
~~~

Request a revision:

~~~bash
curl -X POST http://localhost:8000/contract-review/contract-review-generated-id/decision \
  -H "Content-Type: application/json" \
  -d '{
    "decision":"revise",
    "feedback":"Explain which source contract is affected by each risk.",
    "expected_revision":0
  }'
~~~

Approve the current revision:

~~~bash
curl -X POST http://localhost:8000/contract-review/contract-review-generated-id/decision \
  -H "Content-Type: application/json" \
  -d '{
    "decision":"approve",
    "feedback":"",
    "expected_revision":1
  }'
~~~

---

## Project structure

~~~text
temporal-101/
├── README.md
├── compose.yaml
├── assets/
│   └── diagrams/                         # README architecture diagrams
├── apps/
│   ├── client-app/
│   │   ├── main.py                       # FastAPI endpoints and Temporal client
│   │   ├── api_models.py                 # Request and response validation
│   │   ├── upload_service.py             # PDF validation and S3 upload
│   │   └── artifact_service.py           # Safe Markdown artifact access
│   ├── pdf-extraction/
│   │   ├── workflow_process_pdf.py       # PDFPipelineWorkflow
│   │   ├── activities.py                 # PDF-to-Markdown activity
│   │   ├── worker.py                     # Workflow worker
│   │   └── document_worker.py            # Document activity worker
│   ├── ai-contract-review/
│   │   ├── parent_workflow.py             # ContractReviewWorkflow
│   │   ├── child_workflow.py              # PDFSummaryWorkflow
│   │   ├── document_activities.py         # Extraction and artifact creation
│   │   ├── llm_activities.py              # Analysis, synthesis, and revision
│   │   ├── worker.py                      # Parent/child orchestration worker
│   │   ├── document_worker.py             # Contract document worker
│   │   └── llm_worker.py                  # Contract LLM worker
│   └── react-app/                         # Demonstration client
└── setup/samples-server/                  # Temporal development configuration
~~~

## Engineering decisions

| Decision | Why it is used |
| --- | --- |
| Temporal instead of an in-memory job queue | Preserve long-running state, retry history, timers, and human interactions |
| Parent plus child workflows | Parallelize documents and isolate event histories |
| Workflows separate from activities | Keep orchestration deterministic and external I/O retryable |
| Dedicated task queues | Scale PDF, orchestration, and LLM workloads independently |
| Markdown artifacts in S3 | Reuse extracted text and preserve document lineage |
| SHA-256 metadata | Identify artifact content and expose integrity metadata |
| Queries for reads | Inspect current workflow state without mutating it |
| Signal for reviewer assignment | Record asynchronous input that needs no immediate result |
| Update for decisions | Validate approval or revision and return acceptance feedback |
| Expected revision number | Prevent stale browser actions from approving an outdated report |
| Partial completeness | Produce value from successful documents without hiding failures |
| Docker health dependencies | Start dependent services only after infrastructure is ready |

## Current limits

| Limit | Value |
| --- | --- |
| Contract documents per review | 1–20 unique PDF URIs |
| Local upload size | 50 MiB per PDF by default |
| Default revisions | 2 |
| Maximum revisions | 10 |
| Review wait per cycle | 3 days |
| Workflow worker services | 2 |
| Activity worker services | 3 |
| Temporal task queues | 5 |
| Docker Compose services | 10 |

These limits are guardrails for the educational deployment, not fundamental Temporal limits.

## Skills demonstrated

**Temporal** — durable execution, parent/child workflows, task queues, activity retries, heartbeats, Queries, Signals, Updates, validators, timers, replay-safe orchestration

**Agentic systems** — multi-document decomposition, parallel analysis, structured synthesis, tool boundaries, feedback-driven revision, human approval gates

**Backend engineering** — Python, FastAPI, Pydantic validation, typed API contracts, health checks, async workflow control

**Reliability** — partial success, retry classification, idempotent artifact naming, stale-decision prevention, bounded concurrency and timeouts

**Infrastructure** — Docker Compose, PostgreSQL, Nginx, Temporal UI, S3-compatible storage, environment-based configuration

**Frontend demonstration** — React, TypeScript, Vite, automatic workflow polling, status inspection, and report review

## Stack

| Layer | Technology |
| --- | --- |
| Workflow engine | Temporal 1.29.7 |
| Temporal SDK | Python |
| API | FastAPI |
| Validation | Pydantic |
| Persistence | PostgreSQL 16 |
| PDF extraction | PyMuPDF |
| Object storage | S3-compatible API |
| LLM provider | OpenRouter-compatible API |
| Demo client | React 19, TypeScript, Vite |
| Web server | Nginx |
| Deployment | Docker Compose |

---

This repository focuses on the orchestration patterns required to make AI work durable, observable, and safe to hand over to a person. The interface demonstrates the workflow; Temporal is the system that makes it reliable.
