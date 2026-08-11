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
    }
  | {
      kind: "workflowDetail";
      environment: EnvironmentSummary;
      workflowId: string;
    };
