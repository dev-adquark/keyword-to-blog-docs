import { randomUUID } from "node:crypto";

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export const newUserId = () => id("usr");
export const newCustomerId = () => id("cus");
export const newApiKeyId = () => id("key");
export const newUsageId = () => id("use");
export const newJobId = () => id("job");
export const newAccessRequestId = () => id("ar");
export const newRequestId = () => id("req");
