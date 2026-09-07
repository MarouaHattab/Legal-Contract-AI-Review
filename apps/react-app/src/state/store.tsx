import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { getDefaultApiBaseUrl, setApiBaseUrl } from "../api/client";
import type {
  PipelineDocument,
  ReviewStep,
  WorkflowType,
} from "../api/types";

const STORAGE_KEY = "contract-review-ui";

export interface Notice {
  level: "success" | "warning";
  message: string;
}

export interface AppState {
  documents: PipelineDocument[];
  contractWorkflowId: string;
  contractPhase: string;
  reviewStep: ReviewStep;
  maxRevisions: number;
  lastRevisionFeedback: string;
  lastStartedWorkflowId: string;
  lastSubmissionFingerprint: string;
  lastReviewSubmission: string;
  latestKnownRevision: number | null;
  displayedReviewRevision: number | null;
  flash: string;
  notice: Notice | null;
  selectedWorkflowId: string;
  selectedWorkflowType: WorkflowType | "";
  pdfUploadedFor: string;
  typedKeys: string[];
  apiBaseUrl: string;
  pollIntervalSeconds: number;
}

const defaultState = (): AppState => ({
  documents: [],
  contractWorkflowId: "",
  contractPhase: "",
  reviewStep: "upload",
  maxRevisions: 2,
  lastRevisionFeedback: "",
  lastStartedWorkflowId: "",
  lastSubmissionFingerprint: "",
  lastReviewSubmission: "",
  latestKnownRevision: null,
  displayedReviewRevision: null,
  flash: "",
  notice: null,
  selectedWorkflowId: "",
  selectedWorkflowType: "",
  pdfUploadedFor: "",
  typedKeys: [],
  apiBaseUrl: getDefaultApiBaseUrl(),
  pollIntervalSeconds: 3,
});

function loadState(): AppState {
  const defaults = defaultState();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...defaults,
      ...parsed,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      typedKeys: Array.isArray(parsed.typedKeys) ? parsed.typedKeys : [],
    };
  } catch {
    return defaults;
  }
}

function persist(state: AppState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

type Action =
  | { type: "patch"; value: Partial<AppState> }
  | { type: "reset" }
  | {
      type: "updateDocument";
      source: string;
      changes: Partial<PipelineDocument>;
    }
  | { type: "markTyped"; key: string }
  | { type: "clearFlash" }
  | { type: "clearNotice" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.value };
    case "reset":
      return {
        ...defaultState(),
        apiBaseUrl: state.apiBaseUrl,
        pollIntervalSeconds: state.pollIntervalSeconds,
      };
    case "updateDocument":
      return {
        ...state,
        documents: state.documents.map((item) =>
          item.source_s3_uri === action.source
            ? { ...item, ...action.changes }
            : item,
        ),
      };
    case "markTyped":
      if (state.typedKeys.includes(action.key)) {
        return state;
      }
      return { ...state, typedKeys: [...state.typedKeys, action.key] };
    case "clearFlash":
      return state.flash ? { ...state, flash: "" } : state;
    case "clearNotice":
      return state.notice ? { ...state, notice: null } : state;
    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  setReviewStep: (step: ReviewStep) => void;
  setDocuments: (documents: PipelineDocument[]) => void;
  updateDocument: (source: string, changes: Partial<PipelineDocument>) => void;
  resetPipeline: () => void;
  rememberStarted: (input: {
    workflowId: string;
    workflowType: WorkflowType;
    fingerprint: string;
    uploaded?: boolean;
  }) => void;
  isDuplicate: (fingerprint: string) => boolean;
  setFlash: (message: string) => void;
  setNotice: (notice: Notice | null) => void;
  markTyped: (key: string) => void;
  isTyped: (key: string) => boolean;
  setMaxRevisions: (value: number) => void;
  setLastRevisionFeedback: (value: string) => void;
  setLastReviewSubmission: (value: string) => void;
  setLatestRevision: (value: number) => void;
  setContractPhase: (value: string) => void;
  setDisplayedRevision: (value: number) => void;
  setSelectedWorkflow: (id: string, type: WorkflowType | "") => void;
  setConnection: (apiBaseUrl: string, pollIntervalSeconds: number) => void;
  continueContractOnReview: (workflowId: string) => void;
  clearFlash: () => void;
  clearNotice: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  setApiBaseUrl(state.apiBaseUrl);

  useEffect(() => {
    persist(state);
    setApiBaseUrl(state.apiBaseUrl);
  }, [state]);

  const persistPatch = useCallback((value: Partial<AppState>) => {
    dispatch({ type: "patch", value });
  }, []);

  const value = useMemo<StoreValue>(() => {
    return {
      state,
      setReviewStep: (step) => persistPatch({ reviewStep: step }),
      setDocuments: (documents) => persistPatch({ documents }),
      updateDocument: (source, changes) =>
        dispatch({ type: "updateDocument", source, changes }),
      resetPipeline: () => dispatch({ type: "reset" }),
      rememberStarted: ({ workflowId, workflowType, fingerprint, uploaded }) =>
        persistPatch({
          lastStartedWorkflowId: workflowId,
          lastSubmissionFingerprint: fingerprint,
          selectedWorkflowId: workflowId,
          selectedWorkflowType: workflowType,
          latestKnownRevision: null,
          displayedReviewRevision: null,
          lastReviewSubmission: "",
          notice: null,
          pdfUploadedFor: uploaded ? workflowId : "",
          contractWorkflowId:
            workflowType === "contract_review"
              ? workflowId
              : state.contractWorkflowId,
          contractPhase:
            workflowType === "contract_review" ? "queued" : state.contractPhase,
        }),
      isDuplicate: (fingerprint) =>
        Boolean(state.lastStartedWorkflowId) &&
        state.lastSubmissionFingerprint === fingerprint,
      setFlash: (message) => persistPatch({ flash: message }),
      setNotice: (notice) => persistPatch({ notice }),
      markTyped: (key) => dispatch({ type: "markTyped", key }),
      isTyped: (key) => state.typedKeys.includes(key),
      setMaxRevisions: (maxRevisions) => persistPatch({ maxRevisions }),
      setLastRevisionFeedback: (lastRevisionFeedback) =>
        persistPatch({ lastRevisionFeedback }),
      setLastReviewSubmission: (lastReviewSubmission) =>
        persistPatch({ lastReviewSubmission }),
      setLatestRevision: (latestKnownRevision) =>
        persistPatch({ latestKnownRevision }),
      setContractPhase: (contractPhase) => persistPatch({ contractPhase }),
      setDisplayedRevision: (displayedReviewRevision) =>
        persistPatch({ displayedReviewRevision }),
      setSelectedWorkflow: (selectedWorkflowId, selectedWorkflowType) =>
        persistPatch({
          selectedWorkflowId,
          selectedWorkflowType,
          latestKnownRevision: null,
          displayedReviewRevision: null,
          lastReviewSubmission: "",
          notice: null,
        }),
      setConnection: (apiBaseUrl, pollIntervalSeconds) => {
        setApiBaseUrl(apiBaseUrl);
        persistPatch({ apiBaseUrl, pollIntervalSeconds });
      },
      continueContractOnReview: (workflowId) =>
        persistPatch({
          contractWorkflowId: workflowId,
          contractPhase: "",
          reviewStep: "summary",
          selectedWorkflowId: workflowId,
          selectedWorkflowType: "contract_review",
        }),
      clearFlash: () => dispatch({ type: "clearFlash" }),
      clearNotice: () => dispatch({ type: "clearNotice" }),
    };
  }, [persistPatch, state]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error("useStore must be used inside StoreProvider.");
  }
  return value;
}
