import { ComparisonPage } from "~/components/Comparison";
import { COMPARISONS } from "~/content";

export default function VsCustomerIo() {
  return <ComparisonPage c={COMPARISONS["customer-io"]} />;
}
