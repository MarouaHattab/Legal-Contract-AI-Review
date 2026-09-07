import { useEffect } from "react";
import { useStore } from "../state/store";

export function Flash() {
  const { state, clearFlash, clearNotice } = useStore();

  useEffect(() => {
    if (!state.flash && !state.notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      clearFlash();
      clearNotice();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [clearFlash, clearNotice, state.flash, state.notice]);

  return (
    <>
      {state.flash ? <div className="banner ok">{state.flash}</div> : null}
      {state.notice ? (
        <div
          className={state.notice.level === "success" ? "banner ok" : "banner warn"}
        >
          {state.notice.message}
        </div>
      ) : null}
    </>
  );
}
