import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, api } from "../../api/client"
import { Feedback } from "../../components/Feedback"
import type { ContractWorkflowStatus, ReviewDecision } from "../../types/workflows"

type HumanReviewProps = {
  workflowId: string
  status: ContractWorkflowStatus
}

export function HumanReview({ workflowId, status }: HumanReviewProps) {
  const queryClient = useQueryClient()
  const [reviewer, setReviewer] = useState(status.reviewer)
  const [feedback, setFeedback] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const refreshReview = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["workflow", "contract_review", workflowId],
    })
  }

  const assignment = useMutation({
    mutationFn: (name: string) => api.assignReviewer(workflowId, name),
    onSuccess: async (response) => {
      setError("")
      setNotice(response.message)
      await refreshReview()
    },
    onError: (caught) => {
      setNotice("")
      setError(caught instanceof Error ? caught.message : "Reviewer assignment failed.")
    },
  })

  const decision = useMutation({
    mutationFn: (command: ReviewDecision) => api.submitReview(workflowId, command),
    onSuccess: async (response) => {
      setError("")
      setNotice(response.message)
      setFeedback("")
      await refreshReview()
    },
    onError: async (caught) => {
      setNotice("")
      if (caught instanceof ApiError && caught.status === 409) {
        setError(
          "The workflow changed. Review the latest revision before submitting again.",
        )
        await refreshReview()
        return
      }
      setError(caught instanceof Error ? caught.message : "Review decision failed.")
    },
  })

  if (status.phase !== "awaiting_review") return null

  function assignReviewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = reviewer.trim()
    if (!normalized) {
      setError("Reviewer name is required.")
      return
    }
    setError("")
    assignment.mutate(normalized)
  }

  function submitDecision(kind: "approve" | "revise") {
    const normalizedFeedback = feedback.trim()
    if (kind === "revise" && !normalizedFeedback) {
      setError("Feedback is required.")
      return
    }
    setError("")
    decision.mutate({
      decision: kind,
      feedback: kind === "revise" ? normalizedFeedback : "",
      expected_revision: status.current_revision,
    })
  }

  const busy = assignment.isPending || decision.isPending

  return (
    <section aria-labelledby="review-title" className="review-section">
      <header className="review-header">
        <div>
          <p className="eyebrow">Human review</p>
          <h2 id="review-title">Review revision {status.current_revision}</h2>
        </div>
        <p>Confirm the report or request specific changes.</p>
      </header>

      {notice ? <Feedback tone="success">{notice}</Feedback> : null}
      {error ? <Feedback tone="error">{error}</Feedback> : null}

      <form className="assignment-form" onSubmit={assignReviewer}>
        <label className="field">
          <span>Reviewer</span>
          <input
            maxLength={200}
            onChange={(event) => setReviewer(event.target.value)}
            placeholder="Reviewer name"
            type="text"
            value={reviewer}
          />
        </label>
        <button className="button button-secondary" disabled={busy} type="submit">
          Assign reviewer
        </button>
      </form>

      {!status.reviewer ? (
        <Feedback tone="info">Assign a reviewer before submitting a decision.</Feedback>
      ) : null}

      <div className="decision-grid">
        <section className="decision-option">
          <h3>Approve</h3>
          <p>Accept the current report as the final result.</p>
          <button
            className="button button-primary"
            disabled={busy || !status.reviewer}
            onClick={() => submitDecision("approve")}
            type="button"
          >
            Approve revision {status.current_revision}
          </button>
        </section>
        <section className="decision-option">
          <h3>Request revision</h3>
          <label className="field">
            <span>Revision feedback</span>
            <textarea
              maxLength={10_000}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Describe the changes required in the next report."
              rows={4}
              value={feedback}
            />
          </label>
          <button
            className="button button-secondary"
            disabled={busy || !status.reviewer}
            onClick={() => submitDecision("revise")}
            type="button"
          >
            Request revision
          </button>
        </section>
      </div>
    </section>
  )
}
