import { llmsFullTxt } from "~/lib/llms";
import { textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute("text/plain", llmsFullTxt);

export default function LlmsFullTxt() {
  return null;
}
