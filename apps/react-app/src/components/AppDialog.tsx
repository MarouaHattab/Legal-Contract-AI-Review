import type { ReactNode } from "react"

type AppDialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}

export function AppDialog({
  open,
  title,
  description,
  children,
  onClose,
}: AppDialogProps) {
  if (!open) return null

  return (
    <div className="dialog-layer" onMouseDown={onClose}>
      <dialog
        aria-describedby={description ? "dialog-description" : undefined}
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="app-dialog"
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        onMouseDown={(event) => event.stopPropagation()}
        open
      >
        <header className="dialog-header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description ? (
              <p id="dialog-description">{description}</p>
            ) : null}
          </div>
          <button
            aria-label="Close dialog"
            className="button button-quiet"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>
        {children}
      </dialog>
    </div>
  )
}
