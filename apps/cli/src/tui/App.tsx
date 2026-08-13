import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

import type { Screen } from "./navigation.js";
import { EnvironmentsScreen } from "./screens/EnvironmentsScreen.js";
import { IntegrationDetailScreen } from "./screens/IntegrationDetailScreen.js";
import { IntegrationsScreen } from "./screens/IntegrationsScreen.js";
import { RunHistoryScreen } from "./screens/RunHistoryScreen.js";
import { SectionScreen } from "./screens/SectionScreen.js";
import { SubscriberDetailScreen } from "./screens/SubscriberDetailScreen.js";
import { SubscribersScreen } from "./screens/SubscribersScreen.js";
import { UserScreen } from "./screens/UserScreen.js";
import { WorkflowDetailScreen } from "./screens/WorkflowDetailScreen.js";
import { WorkflowRunsScreen } from "./screens/WorkflowRunsScreen.js";
import { WorkflowsScreen } from "./screens/WorkflowsScreen.js";
import { WorkspacesScreen } from "./screens/WorkspacesScreen.js";

export function App() {
  const { exit } = useApp();
  const [stack, setStack] = useState<Screen[]>([{ kind: "workspaces" }]);

  const push = (screen: Screen) => setStack((s) => [...s, screen]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (key.escape) {
      pop();
    }
  });

  const screen = stack[stack.length - 1];

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
        />
      )}

      {screen.kind === "section" && (
        <SectionScreen
          workspace={screen.workspace}
          environment={screen.environment}
          onSelect={(section) =>
            push({
              kind: section,
              workspace: screen.workspace,
              environment: screen.environment,
            })
          }
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
        />
      )}

      {screen.kind === "workflowRuns" && (
        <WorkflowRunsScreen
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
    </Box>
  );
}
