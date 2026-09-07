export function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4.5a.75.75 0 0 1 .75.75v8.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V5.25A.75.75 0 0 1 12 4.5ZM5 16.5A1.5 1.5 0 0 0 3.5 18v.75A1.75 1.75 0 0 0 5.25 20.5h13.5a1.75 1.75 0 0 0 1.75-1.75V18A1.5 1.5 0 0 0 19 16.5h-1.1c.07.24.1.49.1.75v.75H6v-.75c0-.26.03-.51.1-.75H5Z"
      />
    </svg>
  );
}

export function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3.75A1.75 1.75 0 0 0 5.25 5.5v13c0 .97.78 1.75 1.75 1.75h10A1.75 1.75 0 0 0 18.75 18.5V9.3c0-.46-.18-.9-.51-1.23l-3.8-3.81A1.75 1.75 0 0 0 13.2 3.75H7Zm6.5 1.8 3 3H14.5a1 1 0 0 1-1-1V5.55ZM8.5 12.25h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1 0-1.5Zm0 3.5h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1 0-1.5Z"
      />
    </svg>
  );
}

export function IconReport() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.75 4A1.75 1.75 0 0 0 5 5.75v12.5C5 19.22 5.78 20 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V8.81c0-.46-.18-.91-.51-1.24l-3.06-3.06A1.75 1.75 0 0 0 14.19 4H6.75ZM8 10.25h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5Zm0 3.25h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5Zm0 3.25h5a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5Z"
      />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.53 15.28 6.22 12l-1.06 1.06 4.37 4.37 9-9L17.47 7.37 9.53 15.28Z"
      />
    </svg>
  );
}

export function StepGlyph({ name }: { name: "upload" | "markdown" | "summary" | "decision" }) {
  if (name === "upload") {
    return <IconUpload />;
  }
  if (name === "markdown") {
    return <IconDoc />;
  }
  if (name === "summary") {
    return <IconReport />;
  }
  return <IconCheck />;
}
