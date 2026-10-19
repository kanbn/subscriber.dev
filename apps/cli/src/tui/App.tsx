import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

import { setEnvironmentId } from "@subscriber.dev/api-client/environment";

import type { Screen } from "./navigation.js";
import { isTyping } from "./components/TextInput.js";
import { AnalyticsScreen } from "./screens/AnalyticsScreen.js";
import { BillingScreen } from "./screens/BillingScreen.js";
import { BroadcastsScreen } from "./screens/BroadcastsScreen.js";
import { EnvironmentsScreen } from "./screens/EnvironmentsScreen.js";
import { IntegrationDetailScreen } from "./screens/IntegrationDetailScreen.js";
import { IntegrationsScreen } from "./screens/IntegrationsScreen.js";
import { RunHistoryScreen } from "./screens/RunHistoryScreen.js";
import { SectionScreen } from "./screens/SectionScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { SubscriberDetailScreen } from "./screens/SubscriberDetailScreen.js";
import { SubscribersScreen } from "./screens/SubscribersScreen.js";
import { UserScreen } from "./screens/UserScreen.js";
import { WorkflowDetailScreen } from "./screens/WorkflowDetailScreen.js";
import { WorkflowRunsScreen } from "./screens/WorkflowRunsScreen.js";
import { WorkflowsScreen } from "./screens/WorkflowsScreen.js";
import { WorkflowTriggersScreen } from "./screens/WorkflowTriggersScreen.js";
import { WorkspacesScreen } from "./screens/WorkspacesScreen.js";

export function App() {
  const { exit } = useApp();
  const [stack, setStack] = useState<Screen[]>([{ kind: "workspaces" }]);

  const push = (screen: Screen) => setStack((s) => [...s, screen]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  useInput((input, key) => {
    if (input === "q" && !isTyping()) {
      exit();
      return;
    }
    if (key.escape) {
      pop();
    }
  });

  const screen = stack[stack.length - 1];
  setEnvironmentId(
    "environment" in screen ? screen.environment?.publicId : undefined,
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>
        subscriber.dev
      </Text>

      {screen.kind === "workspaces" && (
        <WorkspacesScreen
          onSelectWorkspace={(workspace) =>
            push({ kind: "environments", workspace })
          }
          onSelectAccount={() => push({ kind: "users" })}
          onGetStarted={() => push({ kind: "setup" })}
          onSetUp={(workspace, environment) =>
            setStack([
              { kind: "workspaces" },
              { kind: "environments", workspace },
              { kind: "setup", workspace, environment },
            ])
          }
        />
      )}

      {screen.kind === "setup" && (
        <SetupScreen
          workspace={screen.workspace}
          environment={screen.environment}
          onDone={(workspace, environment) =>
            setStack([
              { kind: "workspaces" },
              { kind: "environments", workspace },
              { kind: "section", workspace, environment },
            ])
          }
        />
      )}

      {screen.kind === "users" && <UserScreen />}

      {screen.kind === "environments" && (
        <EnvironmentsScreen
          workspace={screen.workspace}
          onSelect={(environment) =>
            push({
              kind: "section",
              workspace: screen.workspace,
              environment,
            })
          }
          onSelectBilling={() =>
            push({ kind: "billing", workspace: screen.workspace })
          }
        />
      )}

      {screen.kind === "billing" && (
        <BillingScreen workspace={screen.workspace} />
      )}

      {screen.kind === "section" && (
        <SectionScreen
          workspace={screen.workspace}
          environment={screen.environment}
          onSelect={(section) => {
            if (section === "setup") {
              push({
                kind: "setup",
                workspace: screen.workspace,
                environment: screen.environment,
              });
              return;
            }
            if (section === "workflows" || section === "broadcastWorkflows") {
              push({
                kind: "workflows",
                workspace: screen.workspace,
                environment: screen.environment,
                workflowType:
                  section === "workflows" ? "automation" : "broadcast",
              });
              return;
            }
            push({
              kind: section,
              workspace: screen.workspace,
              environment: screen.environment,
            });
          }}
        />
      )}

      {screen.kind === "subscribers" && (
        <SubscribersScreen
          environmentId={screen.environment.publicId}
          onSelect={(subscriberId) =>
            push({
              kind: "subscriberDetail",
              environment: screen.environment,
              subscriberId,
            })
          }
        />
      )}

      {screen.kind === "subscriberDetail" && (
        <SubscriberDetailScreen
          environmentId={screen.environment.publicId}
          subscriberId={screen.subscriberId}
          onDeleted={pop}
        />
      )}

      {screen.kind === "workflows" && (
        <WorkflowsScreen
          environmentId={screen.environment.publicId}
          workflowType={screen.workflowType}
          onSelect={(workflowId) =>
            push({
              kind: "workflowDetail",
              environment: screen.environment,
              workflowId,
            })
          }
        />
      )}

      {screen.kind === "workflowDetail" && (
        <WorkflowDetailScreen
          environmentId={screen.environment.publicId}
          workflowId={screen.workflowId}
          onDeleted={pop}
          onViewRuns={() =>
            push({
              kind: "workflowRuns",
              environment: screen.environment,
              workflowId: screen.workflowId,
            })
          }
          onViewBroadcasts={() =>
            push({
              kind: "broadcasts",
              environment: screen.environment,
              workflowId: screen.workflowId,
            })
          }
          onViewTriggers={() =>
            push({
              kind: "workflowTriggers",
              environment: screen.environment,
              workflowId: screen.workflowId,
            })
          }
        />
      )}

      {screen.kind === "workflowTriggers" && (
        <WorkflowTriggersScreen
          environmentId={screen.environment.publicId}
          workflowId={screen.workflowId}
          pickSource={screen.pickSource}
          pickList={screen.pickList}
          onSetUp={(type, list) =>
            push({
              kind: "integrationSetup",
              environment: screen.environment,
              type,
              returnList: list,
            })
          }
        />
      )}

      {screen.kind === "integrationSetup" && (
        <IntegrationsScreen
          environmentId={screen.environment.publicId}
          createType={screen.type}
          onCancelCreate={pop}
          onSelect={(type) =>
            setStack((s) => {
              const below = s[s.length - 2];
              return below?.kind === "workflowTriggers"
                ? [
                    ...s.slice(0, -2),
                    {
                      ...below,
                      pickSource: type,
                      pickList: screen.returnList,
                    },
                  ]
                : s.slice(0, -1);
            })
          }
        />
      )}

      {screen.kind === "workflowRuns" && (
        <WorkflowRunsScreen
          environmentId={screen.environment.publicId}
          workflowId={screen.workflowId}
        />
      )}

      {screen.kind === "broadcasts" && (
        <BroadcastsScreen
          environmentId={screen.environment.publicId}
          workflowId={screen.workflowId}
        />
      )}

      {screen.kind === "runHistory" && (
        <RunHistoryScreen environmentId={screen.environment.publicId} />
      )}

      {screen.kind === "integrations" && (
        <IntegrationsScreen
          environmentId={screen.environment.publicId}
          onSelect={(type) =>
            push({
              kind: "integrationDetail",
              environment: screen.environment,
              type,
            })
          }
        />
      )}

      {screen.kind === "integrationDetail" && (
        <IntegrationDetailScreen
          environmentId={screen.environment.publicId}
          type={screen.type}
          onDeleted={pop}
        />
      )}

      {screen.kind === "analytics" && (
        <AnalyticsScreen environmentId={screen.environment.publicId} />
      )}
    </Box>
  );
}
