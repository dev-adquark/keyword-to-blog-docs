import type { ContentBrief, GenerateRequestV1, RevisionFeedback, SEOPostV1, SeoPlan } from "@/lib/types";

export interface GenerationContext {
  brief?: ContentBrief;
  plan?: SeoPlan;
}

export interface AIProvider {
  generate(request: GenerateRequestV1, context?: GenerationContext): Promise<SEOPostV1>;
  revise(params: {
    request: GenerateRequestV1;
    previous: SEOPostV1;
    feedback: RevisionFeedback;
    context?: GenerationContext;
  }): Promise<SEOPostV1>;
}
