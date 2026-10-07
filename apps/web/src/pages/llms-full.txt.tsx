import { llmsFullTxt } from "~/lib/llms";
import { isLaunched, textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute("text/plain", () =>
  isLaunched() ? llmsFullTxt() : null,
);

export default function LlmsFullTxt() {
  return null;
}
