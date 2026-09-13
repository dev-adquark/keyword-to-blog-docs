export interface PlanConfig {
  id: string;
  name: string;
  priceMonthlyUsd: number;
  requestsPerMinute: number;
  maxWordsPerRequest: number;
  monthlyWords: number;
  priorityProcessing: boolean;
  teamSeats: number;
}

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthlyUsd: 0,
    requestsPerMinute: 3,
    maxWordsPerRequest: 800,
    monthlyWords: 20000,
    priorityProcessing: false,
    teamSeats: 1,
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthlyUsd: 49,
    requestsPerMinute: 15,
    maxWordsPerRequest: 2000,
    monthlyWords: 200000,
    priorityProcessing: false,
    teamSeats: 3,
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthlyUsd: 199,
    requestsPerMinute: 60,
    maxWordsPerRequest: 4000,
    monthlyWords: 1200000,
    priorityProcessing: true,
    teamSeats: 10,
  },
];

export function getPlan(id: string): PlanConfig {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan id: ${id}`);
  return plan;
}
