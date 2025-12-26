import { t } from "@lingui/core/macro";

import { Dashboard } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";

export default function EnvironmentView() {
  return (
    <>
      <PageHead title={t`Environment | subscriber.dev`} />
      <Dashboard>
        <></>
      </Dashboard>
    </>
  );
}
