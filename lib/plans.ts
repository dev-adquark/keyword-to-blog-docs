export interface PlanConfig {
  id: string;
  name: string;
  priceMonthlyUsd: number;
  /** Short-term burst protection. */
  requestsPerMinute: number;
  /** Primary Free-tier control lever: daily request quota per API key. */
  requestsPerDay: number;
  /** Longer-term billing-cycle allowance. */
  monthlyRequests: number;
  maxWordsPerRequest: number;
  monthlyWords: number;
  priorityProcessing: boolean;
  teamSeats: number;
  /** Scopes granted to keys created under this plan by default. */
  defaultScopes: string[];
  maxConcurrentJobs: number;
}

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthlyUsd: 0,
    requestsPerMinute: 1,
    requestsPerDay: 3,
    monthlyRequests: 90,
    maxWordsPerRequest: 1500,
    monthlyWords: 20000,
    priorityProcessing: false,
    teamSeats: 1,
    defaultScopes: ["generate", "jobs:create", "jobs:read", "usage:read"],
    maxConcurrentJobs: 1,
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthlyUsd: 49,
    requestsPerMinute: 15,
    requestsPerDay: 500,
    monthlyRequests: 5000,
    maxWordsPerRequest: 2000,
    monthlyWords: 200000,
    priorityProcessing: false,
    teamSeats: 3,
    defaultScopes: ["generate", "jobs:create", "jobs:read", "usage:read"],
    maxConcurrentJobs: 3,
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthlyUsd: 199,
    requestsPerMinute: 60,
    requestsPerDay: 5000,
    monthlyRequests: 50000,
    maxWordsPerRequest: 4000,
    monthlyWords: 1200000,
    priorityProcessing: true,
    teamSeats: 10,
    defaultScopes: ["generate", "jobs:create", "jobs:read", "usage:read"],
    maxConcurrentJobs: 10,
  },
];

/** Plan a brand-new signup is assigned before any approval/upgrade. */
export const DEFAULT_PLAN_ID = "starter";

export function getPlan(id: string): PlanConfig {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan id: ${id}`);
  return plan;
}
