import { t } from "@lingui/core/macro";

import { Dashboard } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";

export default function WorkspaceView() {
  return (
    <>
      <PageHead title={t`Workspace | subscriber.dev`} />
      <Dashboard>
        <></>
      </Dashboard>
    </>
  );
}
