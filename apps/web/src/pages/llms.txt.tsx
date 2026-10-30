import { llmsTxt } from "~/lib/llms";
import { textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute("text/plain", llmsTxt);

export default function LlmsTxt() {
  return null;
}
