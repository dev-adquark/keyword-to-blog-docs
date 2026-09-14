import type { GenerateRequestV1, SEOPostV1 } from "@/lib/types";

export interface AIProvider {
  generate(request: GenerateRequestV1): Promise<SEOPostV1>;
}
