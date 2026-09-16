export interface TeamMember {
  email: string;
  role: string;
}

export interface ResetCredential {
  email: string;
  role: string;
  password: string;
}

export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export const TEAM: TeamMember[];

export function hasResetPasswordsFlag(argv?: string[]): boolean;

export function resetTeamPasswords(
  client: SqlClient,
  opts?: {
    passwordGenerator?: () => string;
    hashPassword?: (password: string, saltRounds: number) => Promise<string>;
  }
): Promise<ResetCredential[]>;

export function printResetCredentials(
  credentials: ResetCredential[],
  output?: (line: string) => void
): void;
