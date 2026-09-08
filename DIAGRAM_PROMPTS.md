# Architecture Diagram Prompts

These prompts are designed for ChatGPT image generation or another diagram-capable model. They describe the real architecture in this repository and keep the visual language consistent across a README, portfolio post, and LinkedIn carousel.

## Shared visual direction

Use this style paragraph at the start of every prompt:

> Create a clean hand-drawn systems architecture diagram that looks made by a thoughtful human in Excalidraw or Miro: warm-white paper canvas, dark navy marker outlines, slightly imperfect rounded rectangles and arrows, limited flat colors, generous whitespace, clear hierarchy, and short readable labels. Use navy/blue for Temporal and API boundaries, green for workers and activities, amber for task queues and durable state, purple for external services, and a small coral accent only for failures or review decisions. Use a consistent handwritten-style sans-serif font, but keep all technical labels legible. No 3D, no gradients, no photorealism, no stock icons, no glossy SaaS dashboard, no Mermaid syntax, no code screenshot, no fake terminal window, no decorative cloud clutter, and no invented components.

Generate a 16:9 landscape image at 1800–2200 pixels wide. Keep every label inside its shape, use arrowheads to show direction, and leave a clear margin around the composition. The result should look like a real architecture workshop board prepared by an engineer.

## Prompt 1 — System overview

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Draw the high-level architecture for an AI contract review system called “Temporal-first AI Contract Review”. Put Temporal Server at the center inside a large navy outlined boundary, with PostgreSQL below it as durable persistence. On the left, show a small FastAPI API box with “:8000” and a small browser/demo client box labelled “React demo client”. On the right, show two worker groups: “PDF extraction workers” and “Contract review workers”.

Inside the contract worker group, show “parent workflow”, “child workflow × N”, “document activities”, and “LLM activities”. Outside the Temporal boundary, show two external service circles: “S3-compatible storage” and “OpenRouter”. Draw arrows for: client → FastAPI, FastAPI → Temporal, Temporal → task queues, workers ↔ Temporal, document activities ↔ S3, LLM activities ↔ OpenRouter, and results → FastAPI → client.

Add one small callout: “Temporal owns durable state, retries, timers, and human review waiting”. Make this a technical architecture board, not a product marketing graphic.
~~~

## Prompt 2 — PDF extraction workflow

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Draw a step-by-step workflow titled “PDFPipelineWorkflow — durable PDF to Markdown”. Use a left-to-right sequence with six numbered nodes: “PDF URI received”, “workflow started”, “Temporal task queue”, “convert_pdf_to_markdown activity”, “Markdown artifact uploaded”, and “workflow result returned”.

Show the API on the far left, Temporal Server and the queue in the middle, and a PDF document worker on the right. Attach the S3-compatible storage circle to the conversion activity. Add small annotations on the activity: “download”, “PyMuPDF extraction”, “SHA-256”, “safe derived key”, and “retry policy”. Add a small amber heartbeat icon beside the activity and a coral side note: “invalid PDF / unsafe output key → non-retryable failure”.

Use only the actual components named above. Emphasize that FastAPI starts the workflow and does not perform the PDF processing itself.
~~~

## Prompt 3 — Parallel contract fan-out

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Draw a technical architecture diagram titled “ContractReviewWorkflow — fan-out into isolated child workflows”. Place a large parent workflow box in the center labelled “ContractReviewWorkflow”. From it, draw three clean parallel arrows to three green child workflow cards labelled “PDFSummaryWorkflow — contract 1”, “PDFSummaryWorkflow — contract 2”, and “PDFSummaryWorkflow — contract N”.

Inside each child card, show two stacked steps: “extract_contract_artifact” and “analyze_contract_artifact”. Show the child cards returning “DocumentOutcome” objects to the parent. Below the parent, show “completeness = complete | partial | failed”. On the left, show “N S3 PDF paths” entering through FastAPI and Temporal. On the right, show the parent continuing to “synthesize_contract_report”.

Add a handwritten callout: “Each child has its own event history; one failed document does not erase the others”. Use subtle queue labels: “contract-review-queue”, “contract-document-processing-queue”, and “contract-llm-queue”.
~~~

## Prompt 4 — Retry and heartbeat behavior

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Create a close-up architecture explainer titled “Why the activities are durable”. Show a Temporal workflow box on the left connected to an activity worker box on the right. Inside the activity worker, show a long-running PDF or LLM operation split into small handwritten checkpoints. Draw dotted heartbeat arrows back to Temporal labelled “stage”, “page range”, and “characters processed”.

Above the activity, draw a retry timeline with small amber markers: “attempt 1”, “2s”, “attempt 2”, “4s”, “attempt 3”, “up to 60s”. Beside it, show two branches: a green branch labelled “transient network / provider error → retry” and a coral branch labelled “invalid PDF / unsafe output key → non-retryable”.

Add a bottom note: “The worker may restart; Temporal still knows what happened”. Keep this as an engineering teaching diagram with no generic cloud symbols.
~~~

## Prompt 5 — Human-in-the-loop review state

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Draw a hand-drawn state-machine diagram titled “Human review is durable workflow state”. Put “awaiting_review” in a large amber rounded rectangle in the center, with a small note “workflow.wait_condition — zero worker compute while waiting”.

From the left, show “GET status / report” entering as a blue arrow labelled “Temporal Query”. From above, show “assign reviewer” entering as a green arrow labelled “Temporal Signal”. From the right, show a reviewer decision card with two arrows: “approve” goes to a green “approved / completed” state, and “revise + feedback” goes to a blue “revise_contract_report activity” state. That revision state loops back into “awaiting_review” with “revision_count + 1”.

Add a small validator checklist beside the decision card: “reviewer assigned”, “expected revision matches”, “decision valid”, “feedback required for revise”, and “max revisions enforced”. The visual should make clear that a reviewer may respond much later without losing workflow state.
~~~

## Prompt 6 — Complete end-to-end portfolio diagram

~~~text
[PASTE THE SHARED VISUAL DIRECTION]

Create one polished but human-made architecture board titled “Temporal-first AI Contract Review — complete execution story”. Use five horizontal zones with handwritten labels: “Client”, “API”, “Temporal”, “Workers”, and “External services”.

In Client, show “browser / React demo”. In API, show “FastAPI :8000” and the endpoints “start”, “status”, “report”, “decision”. In Temporal, show “Temporal Server :7233”, “PostgreSQL”, and the five queues: “pdf-pipeline-queue”, “pdf-document-processing-queue”, “contract-review-queue”, “contract-document-processing-queue”, and “contract-llm-queue”. In Workers, show “PDFPipelineWorkflow”, “ContractReviewWorkflow”, “PDFSummaryWorkflow × N”, “document workers”, and “LLM workers”. In External services, show “S3-compatible storage” and “OpenRouter”.

Use numbered arrows to tell the complete story: (1) upload or provide PDF paths, (2) start workflow, (3) Temporal dispatches work, (4) child workflows process documents in parallel, (5) activities heartbeat and retry, (6) LLM synthesizes report, (7) workflow pauses for human review, (8) approve or revise, (9) durable result returns to the client. Add a final callout: “The interface is replaceable; the workflow guarantees are the product.”
~~~

## Generation checklist

Before accepting an image, check that:

- Temporal Server is visually central rather than the React client;
- the parent/child workflow relationship is obvious;
- task queues and worker boundaries are readable;
- the human review wait and approve/revise loop are visible;
- no credentials, fake endpoints, invented queues, or generic AI brain icons appear;
- text is readable at README width;
- arrows have one clear direction and do not cross unnecessarily;
- colors match across all six images.

Recommended filenames:

~~~text
docs/diagrams/01-temporal-system-overview.png
docs/diagrams/02-pdf-pipeline.png
docs/diagrams/03-contract-fanout.png
docs/diagrams/04-retries-and-heartbeats.png
docs/diagrams/05-human-review-state.png
docs/diagrams/06-complete-execution-story.png
~~~

For a LinkedIn carousel, export the same six diagrams as 1600×900 PNGs and use the overview, fan-out, human-review, and complete-story images as the strongest four slides.

