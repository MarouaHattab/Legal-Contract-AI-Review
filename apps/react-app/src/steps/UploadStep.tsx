import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { PipelineDocument } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { IconUpload } from "../components/Icons";
import { StepActions } from "../components/StepActions";
import { StepFrame } from "../components/StepFrame";
import { fileFingerprint, submissionFingerprint } from "../lib/fingerprint";
import {
  formatBytes,
  MAX_CONTRACT_DOCUMENTS,
  mergePdfSelection,
  parseContractPaths,
  sourceFilename,
  type FileRejection,
} from "../lib/s3";
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
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const [s3Text, setS3Text] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState({
    maxFiles: MAX_CONTRACT_DOCUMENTS,
    maxBytes: 50 * 1024 * 1024,
  });

  useEffect(() => {
    let active = true;
    void api
      .getSettings()
      .then((settings) => {
        if (active) {
          setLimits({
            maxFiles: settings.upload_max_files,
            maxBytes: settings.upload_max_bytes,
          });
        }
      })
      .catch(() => {
        // The documented defaults keep selection usable while the API recovers.
      });
    return () => {
      active = false;
    };
  }, []);

  function takeFiles(list: FileList | File[] | null) {
    const result = mergePdfSelection(files, Array.from(list ?? []), limits);
    setFiles(result.files);
    setRejections(result.rejections);
  }

  function removeFile(target: File) {
    setFiles((selected) => selected.filter((file) => file !== target));
    setRejections([]);
  }

  function clearFiles() {
    setFiles([]);
    setRejections([]);
    if (inputRef.current) {
      inputRef.current.value = "";
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
      const s3Paths = s3Text.trim()
        ? parseContractPaths(s3Text, limits.maxFiles - files.length)
        : [];
      if (!files.length && !s3Paths.length) {
        throw new Error("Upload at least one PDF or enter an S3 PDF URI.");
      }
      const sources: Array<
        Pick<PipelineDocument, "filename" | "source_s3_uri" | "origin">
      > = [];
      let fingerprintFiles: Array<{ filename: string; sha256: string }> = [];
      if (files.length) {
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
      for (const path of s3Paths) {
        sources.push({
          filename: sourceFilename(path),
          source_s3_uri: path,
          origin: "s3",
        });
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
      description="Build one review set from local PDFs, existing S3 objects, or both."
      footer={
        <StepActions
          showBack={false}
          note={`${files.length}/${limits.maxFiles} local PDFs selected · ${formatBytes(limits.maxBytes)} each`}
          continueLabel={
            busy ? "Starting conversion…" : "Convert to Markdown"
          }
          continueEnabled={
            !busy && Boolean(files.length || s3Text.trim())
          }
          onContinue={() => void submit()}
        />
      }
    >
      <ErrorBanner error={error} />
      <div className="intake-grid">
        <section className="intake-option" aria-labelledby="local-files-title">
          <div className="intake-label">A · From this computer</div>
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
            <strong id="local-files-title">Drop PDF contracts here</strong>
            <p className="tip">
              Add to your selection in one or several batches.
            </p>
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
              onChange={(event) => {
                takeFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>
          {rejections.length ? (
            <ul className="file-rejections" aria-live="polite">
              {rejections.map((item, index) => (
                <li key={`${item.name}-${item.code}-${index}`}>
                  <strong>{item.name}</strong> — {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          {files.length ? (
            <div className="selected-files">
              <div className="selected-files-head">
                <strong>
                  {files.length} file{files.length === 1 ? "" : "s"} ready
                </strong>
                <button type="button" className="text-button" onClick={clearFiles}>
                  Clear all
                </button>
              </div>
              <ul className="file-list">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <span className="file-mark" aria-hidden="true">PDF</span>
                    <span className="file-detail">
                      <strong>{file.name}</strong>
                      <small>{formatBytes(file.size)} · Ready to upload</small>
                    </span>
                    <button
                      type="button"
                      className="file-remove"
                      onClick={() => removeFile(file)}
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        <section className="intake-option" aria-labelledby="s3-uris-label">
          <div className="intake-label">B · Already in object storage</div>
          <div className="field s3-field">
            <label id="s3-uris-label" htmlFor="s3-uris">
              S3 PDF paths
            </label>
            <p className="field-help">
              Enter one full <code>s3://bucket/key.pdf</code> URI per line.
              These objects are processed in the same review set as local files.
            </p>
            <textarea
              id="s3-uris"
              value={s3Text}
              onChange={(event) => setS3Text(event.target.value)}
              placeholder={"s3://contracts/legal/master-services.pdf\ns3://contracts/legal/security-addendum.pdf"}
            />
          </div>
          <div className="intake-note">
            {limits.maxFiles - files.length} place
            {limits.maxFiles - files.length === 1 ? "" : "s"} remain in this
            review set.
          </div>
        </section>
      </div>
    </StepFrame>
  );
}
