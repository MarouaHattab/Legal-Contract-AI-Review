import { useState, type DragEvent, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

import { api } from "../../api/client"
import { AppDialog } from "../../components/AppDialog"
import { Feedback } from "../../components/Feedback"
import type { WorkflowType } from "../../types/workflows"

type CreateWorkflowDialogProps = {
  open: boolean
  onClose: () => void
}

type InputMode = "upload" | "s3"

function isS3Pdf(value: string): boolean {
  return /^s3:\/\/[^/@?#\s]+\/[^?#\s]+\.pdf$/i.test(value)
}

function parseS3Paths(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean)
}

function validateFiles(files: File[], workflowType: WorkflowType): string {
  if (files.length === 0) return "Choose at least one PDF file."
  if (workflowType === "pdf" && files.length !== 1)
    return "PDF extraction accepts one PDF file."
  if (files.length > 20) return "Contract review accepts at most 20 PDF files."
  if (
    files.some(
      (file) =>
        !file.name.toLowerCase().endsWith(".pdf") ||
        file.type !== "application/pdf",
    )
  ) {
    return "Every selected file must be a PDF."
  }
  return ""
}

export function CreateWorkflowDialog({
  open,
  onClose,
}: CreateWorkflowDialogProps) {
  const navigate = useNavigate()
  const [workflowType, setWorkflowType] =
    useState<WorkflowType>("pdf")
  const [inputMode, setInputMode] = useState<InputMode>("upload")
  const [files, setFiles] = useState<File[]>([])
  const [s3Paths, setS3Paths] = useState("")
  const [maxRevisions, setMaxRevisions] = useState(2)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)

  function handleClose() {
    setError("")
    onClose()
  }

  function updateWorkflowType(value: WorkflowType) {
    setWorkflowType(value)
    setFiles((selected) => (value === "pdf" ? selected.slice(0, 1) : selected))
    setError("")
  }

  function acceptFiles(selected: File[]) {
    setFiles(workflowType === "pdf" ? selected.slice(0, 1) : selected.slice(0, 20))
    setError("")
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    acceptFiles(Array.from(event.dataTransfer.files))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")

    let paths: string[]
    if (inputMode === "upload") {
      const fileError = validateFiles(files, workflowType)
      if (fileError) {
        setError(fileError)
        return
      }
      setSubmitting(true)
      try {
        const uploaded = await api.uploadPdfs(files)
        paths = uploaded.files.map((file) => file.s3_uri)
      } catch (caught) {
        setSubmitting(false)
        setError(caught instanceof Error ? caught.message : "PDF upload failed.")
        return
      }
    } else {
      paths = parseS3Paths(s3Paths)
      if (
        paths.length === 0 ||
        paths.some((path) => !isS3Pdf(path)) ||
        new Set(paths).size !== paths.length
      ) {
        setError("Use valid s3://bucket/key.pdf locations.")
        return
      }
      if (workflowType === "pdf" && paths.length !== 1) {
        setError("PDF extraction accepts one S3 PDF location.")
        return
      }
      if (paths.length > 20) {
        setError("Contract review accepts at most 20 S3 PDF locations.")
        return
      }
      setSubmitting(true)
    }

    if (!Number.isInteger(maxRevisions) || maxRevisions < 0 || maxRevisions > 10) {
      setSubmitting(false)
      setError("Maximum revisions must be between 0 and 10.")
      return
    }

    try {
      const response =
        workflowType === "pdf"
          ? await api.startPdf(paths[0])
          : await api.startContractReview(paths, maxRevisions)
      handleClose()
      navigate(
        `/workflows/${workflowType}/${encodeURIComponent(response.workflow_id)}`,
      )
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The workflow could not start.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  const isContract = workflowType === "contract_review"

  return (
    <AppDialog
      description="Choose a workflow and provide PDF files from your computer or S3."
      onClose={handleClose}
      open={open}
      title="New workflow"
    >
      <form className="workflow-form" noValidate onSubmit={handleSubmit}>
        <label className="field">
          <span>Workflow type</span>
          <select
            onChange={(event) =>
              updateWorkflowType(event.target.value as WorkflowType)
            }
            value={workflowType}
          >
            <option value="pdf">PDF extraction</option>
            <option value="contract_review">Contract review</option>
          </select>
        </label>

        <fieldset className="segmented-field">
          <legend>PDF source</legend>
          <div className="segmented-control">
            <label>
              <input
                checked={inputMode === "upload"}
                name="input-mode"
                onChange={() => setInputMode("upload")}
                type="radio"
              />
              <span>Upload files</span>
            </label>
            <label>
              <input
                checked={inputMode === "s3"}
                name="input-mode"
                onChange={() => setInputMode("s3")}
                type="radio"
              />
              <span>Use S3 locations</span>
            </label>
          </div>
        </fieldset>

        {inputMode === "upload" ? (
          <div
            className={`drop-zone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <label htmlFor="pdf-files">
              <strong>Drop PDF files here</strong>
              <span>or choose from your computer</span>
            </label>
            <input
              accept="application/pdf,.pdf"
              aria-label="PDF files"
              id="pdf-files"
              multiple={isContract}
              onChange={(event) => acceptFiles(Array.from(event.target.files ?? []))}
              type="file"
            />
            {files.length > 0 ? (
              <ul className="selected-files" aria-label="Selected PDF files">
                {files.map((file) => (
                  <li key={`${file.name}:${file.size}`}>
                    <span>{file.name}</span>
                    <span>{Math.max(1, Math.ceil(file.size / 1024))} KB</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : isContract ? (
          <label className="field">
            <span>S3 PDF locations</span>
            <textarea
              aria-label="S3 PDF locations"
              onChange={(event) => setS3Paths(event.target.value)}
              placeholder={"s3://bucket/contracts/first.pdf\ns3://bucket/contracts/second.pdf"}
              rows={5}
              value={s3Paths}
            />
            <small>Enter one S3 location per line.</small>
          </label>
        ) : (
          <label className="field">
            <span>S3 PDF location</span>
            <input
              onChange={(event) => setS3Paths(event.target.value)}
              placeholder="s3://bucket/documents/source.pdf"
              type="text"
              value={s3Paths}
            />
          </label>
        )}

        {isContract ? (
          <label className="field field-short">
            <span>Maximum revisions</span>
            <input
              max={10}
              min={0}
              onChange={(event) => setMaxRevisions(Number(event.target.value))}
              type="number"
              value={maxRevisions}
            />
          </label>
        ) : null}

        {error ? <Feedback tone="error">{error}</Feedback> : null}

        <footer className="dialog-actions">
          <button
            className="button button-secondary"
            disabled={submitting}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting
              ? "Starting…"
              : isContract
                ? "Start contract review"
                : "Start PDF extraction"}
          </button>
        </footer>
      </form>
    </AppDialog>
  )
}
