import { Link, Route, Routes } from "react-router-dom"

import { WorkflowHome } from "./features/workflows/WorkflowHome"

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
      <Route path="/" element={<WorkflowHome />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
