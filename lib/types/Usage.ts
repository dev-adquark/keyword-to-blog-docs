export interface UsageResponseV1 {
  plan: {
    id: string;
    name: string;
    priorityProcessing: boolean;
    teamSeats: number;
  };
  periodStart: string;
  periodEnd: string;
  metering: {
    unit: "word" | "post";
    granularity: "request" | "generation";
  };
  limits: {
    monthlyWords?: number;
    monthlyPosts?: number;
    maxWordsPerRequest: number;
    requestsPerMinute: number;
  };
  consumed: {
    words?: number;
    posts?: number;
    requests?: number;
  };
  remaining: {
    words?: number;
    posts?: number;
    requests?: number;
  };
}
