import { llmsTxt } from "~/lib/llms";
import { isLaunched, textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute("text/plain", () =>
  isLaunched() ? llmsTxt() : null,
);

export default function LlmsTxt() {
  return null;
}
