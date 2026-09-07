import { useState } from "react";
import { api } from "../api/client";
import { usePoll } from "./usePoll";
import { useStore } from "../state/store";

export function useContractPhase(workflowId: string): string {
  const { state, setLatestRevision } = useStore();
  const [phase, setPhase] = useState("");

  usePoll(
    async () => {
      if (!workflowId) {
        setPhase("");
        return;
      }
      const status = await api.getContractStatus(workflowId);
      setPhase(status.phase);
      setLatestRevision(status.current_revision);
    },
    {
      enabled: Boolean(workflowId),
      intervalMs: state.pollIntervalSeconds * 1000,
    },
  );

  return phase;
}
