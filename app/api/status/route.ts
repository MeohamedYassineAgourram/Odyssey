import { json } from "../../lib/api-guard";
import { providerStatus } from "../../lib/server-env";

export async function GET() {
  // Configuration presence is not a claim that provider credentials were tested.
  return json(providerStatus());
}
