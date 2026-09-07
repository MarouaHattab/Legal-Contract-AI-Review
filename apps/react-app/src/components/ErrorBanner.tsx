import { isAPIError } from "../api/errors";

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  const message = isAPIError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : "Something went wrong.";
  const warning =
    isAPIError(error) &&
    (error.kind === "timeout" ||
      error.kind === "conflict" ||
      error.kind === "not_found");
  return (
    <div className={warning ? "banner warn" : "banner err"}>{message}</div>
  );
}
