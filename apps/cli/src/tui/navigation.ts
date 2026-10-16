import type { TriggerList } from "./screens/WorkflowTriggersScreen.js";

export interface WorkspaceSummary {
  publicId: string;
  name: string;
}

export interface EnvironmentSummary {
  publicId: string;
  name: string;
}

export type Screen =
  | { kind: "workspaces" }
  | {
      kind: "setup";
      workspace?: WorkspaceSummary;
      environment?: EnvironmentSummary;
    }
  | { kind: "users" }
  | { kind: "billing"; workspace: WorkspaceSummary }
  | { kind: "environments"; workspace: WorkspaceSummary }
  | {
      kind: "section";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
    }
  | {
      kind: "subscribers";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
    }
  | {
      kind: "subscriberDetail";
      environment: EnvironmentSummary;
      subscriberId: string;
    }
  | {
      kind: "workflows";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
      workflowType: "automation" | "broadcast";
    }
  | {
      kind: "workflowDetail";
      environment: EnvironmentSummary;
      workflowId: string;
    }
  | {
      kind: "workflowTriggers";
      environment: EnvironmentSummary;
      workflowId: string;
      pickSource?: string;
      pickList?: TriggerList;
    }
  | {
      kind: "integrationSetup";
      environment: EnvironmentSummary;
      type: string;
      returnList?: TriggerList;
    }
  | {
      kind: "workflowRuns";
      environment: EnvironmentSummary;
      workflowId: string;
    }
  | {
      kind: "broadcasts";
      environment: EnvironmentSummary;
      workflowId: string;
    }
  | {
      kind: "runHistory";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
    }
  | {
      kind: "integrations";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
    }
  | {
      kind: "integrationDetail";
      environment: EnvironmentSummary;
      type: string;
    }
  | {
      kind: "analytics";
      workspace: WorkspaceSummary;
      environment: EnvironmentSummary;
    };
