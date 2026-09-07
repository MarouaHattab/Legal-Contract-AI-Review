import { useRef, useState } from "react";
import { api } from "../api/client";
import type { PipelineDocument } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { IconUpload } from "../components/Icons";
import { StepActions } from "../components/StepActions";
import { StepFrame } from "../components/StepFrame";
import { fileFingerprint, submissionFingerprint } from "../lib/fingerprint";
import { parseContractPaths, sourceFilename } from "../lib/s3";
import { useStore } from "../state/store";

export function UploadStep({ onContinue }: { onContinue: () => void }) {
  const {
    state,
    setDocuments,
    rememberStarted,
    isDuplicate,
    setFlash,
    setReviewStep,
    resetPipeline,
  } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [s3Text, setS3Text] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function takeFiles(list: FileList | File[] | null) {
    const next = Array.from(list ?? []).filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );
    if (next.length) {
      setFiles(next);
    }
  }

  if (state.documents.length) {
    return (
      <StepFrame
        icon="upload"
        title="Uploaded documents"
        description="These files are already in this run. Continue to Markdown, or start over."
        footer={
          <StepActions
            showBack={false}
            note={`${state.documents.length} file${state.documents.length === 1 ? "" : "s"} in this run`}
            continueLabel="Continue to Markdown"
            onContinue={onContinue}
            onReset={resetPipeline}
          />
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Source</th>
                <th>Origin</th>
              </tr>
            </thead>
            <tbody>
              {state.documents.map((item) => (
                <tr key={item.source_s3_uri}>
                  <td>{item.filename}</td>
                  <td>{item.source_s3_uri}</td>
                  <td>{item.origin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StepFrame>
    );
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const sources: Array<
        Pick<PipelineDocument, "filename" | "source_s3_uri" | "origin">
      > = [];
      let fingerprintFiles: Array<{ filename: string; sha256: string }> = [];
      if (files.length) {
        if (files.length > 20) {
          throw new Error("Select at most 20 PDF files.");
        }
        const uploaded = await api.uploadPdfs(files);
        if (uploaded.files.length !== files.length) {
          throw new Error("The upload service returned an unexpected file count.");
        }
        sources.push(
          ...uploaded.files.map((file) => ({
            filename: file.filename,
            source_s3_uri: file.s3_uri,
            origin: "upload" as const,
          })),
        );
        fingerprintFiles = await Promise.all(files.map(fileFingerprint));
      }
      if (s3Text.trim()) {
        for (const path of parseContractPaths(s3Text)) {
          sources.push({
            filename: sourceFilename(path),
            source_s3_uri: path,
            origin: "s3",
          });
        }
      }
      const unique: typeof sources = [];
      const seen = new Set<string>();
      for (const item of sources) {
        if (seen.has(item.source_s3_uri)) {
          continue;
        }
        seen.add(item.source_s3_uri);
        unique.push(item);
      }
      if (!unique.length) {
        throw new Error("Upload at least one PDF or enter an S3 PDF URI.");
      }
      const fingerprint = await submissionFingerprint("pipeline_pdf", {
        files: fingerprintFiles,
        s3_paths: unique.map((item) => item.source_s3_uri),
      });
      if (isDuplicate(fingerprint)) {
        throw new Error(
          "This exact document set was already started in this browser session.",
        );
      }
      const pipeline: PipelineDocument[] = [];
      let lastWorkflowId = "";
      for (const item of unique) {
        const record: PipelineDocument = {
          ...item,
          pdf_workflow_id: "",
          markdown_s3_uri: "",
          markdown_sha256: "",
          markdown_size_bytes: "",
          markdown_ready: "",
          error: "",
        };
        try {
          const started = await api.startPdf(item.source_s3_uri);
          record.pdf_workflow_id = started.workflow_id;
          lastWorkflowId = started.workflow_id;
        } catch (err) {
          record.error = err instanceof Error ? err.message : "Start failed.";
        }
        pipeline.push(record);
      }
      setDocuments(pipeline);
      if (lastWorkflowId) {
        rememberStarted({
          workflowId: lastWorkflowId,
          workflowType: "pdf",
          fingerprint,
          uploaded: unique.some((item) => item.origin === "upload"),
        });
      }
      setReviewStep("markdown");
      setFlash("Markdown conversion started.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepFrame
      icon="upload"
      title="Upload PDFs"
      description="Contract PDFs from this computer, or existing S3 URIs. Max 50 MB each."
      footer={
        <StepActions
          showBack={false}
          note="Supported: PDF — max 20 files"
          continueLabel={
            busy ? "Starting conversion…" : "Convert to Markdown"
          }
          continueEnabled={!busy}
          onContinue={() => void submit()}
        />
      }
    >
      <ErrorBanner error={error} />
      <div
        className={dragging ? "dropzone drag" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          takeFiles(event.dataTransfer.files);
        }}
      >
        <div className="icon-tile">
          <IconUpload />
        </div>
        <strong>Drop your files here</strong>
        <p className="tip">Tip: you can select more than one PDF.</p>
        <button
          type="button"
          className="btn"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          id="pdf-files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(event) => takeFiles(event.target.files)}
        />
        {files.length ? (
          <div className="file-chips">
            {files.map((file) => (
              <span key={`${file.name}-${file.size}`} className="file-chip">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="s3-uris">Or paste existing S3 PDF URIs</label>
        <textarea
          id="s3-uris"
          value={s3Text}
          onChange={(event) => setS3Text(event.target.value)}
          placeholder="s3://bucket/contracts/example.pdf"
        />
      </div>
    </StepFrame>
  );
}
