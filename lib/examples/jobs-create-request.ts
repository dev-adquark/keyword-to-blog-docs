import { JobsCreateRequestV1 } from "@/lib/types";
import { generateRequestExample } from "./generate-request";

export const jobsCreateRequestExample = {
  generateRequest: generateRequestExample,
  webhook: {
    url: "https://example.com/webhooks/keyword-to-blog",
    events: ["job.succeeded", "job.failed"],
    signingSecretPresent: true,
  },
  format: {
    responseTypes: ["json", "markdown"],
  },
  idempotencyKey: "job_create_local_0192",
} satisfies JobsCreateRequestV1;
