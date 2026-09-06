import { Link, Route, Routes } from "react-router-dom"

function WorkflowWorkspace() {
  return (
    <main className="shell">
      <header className="page-header">
        <p className="eyebrow">Document operations</p>
        <h1>All workflows</h1>
        <p className="page-summary">
          Start, monitor, and review PDF and contract workflows.
        </p>
      </header>
    </main>
  )
}

function NotFound() {
  return (
    <main className="shell compact-page">
      <h1>Page not found</h1>
      <p>The requested workflow page does not exist.</p>
      <Link className="text-link" to="/">
        Return to workflows
      </Link>
    </main>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkflowWorkspace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
