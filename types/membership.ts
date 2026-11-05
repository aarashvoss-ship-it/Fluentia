export const MEMBERSHIP_TIERS = [
  "Fellowship",
  "Associate",
  "Mastery",
  "Executive",
  "Honorary Fellow",
  "Honorary Guest",
] as const;

export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const DEFAULT_MEMBERSHIP_TIER: MembershipTier = "Associate";

export const MEMBERSHIP_BADGE_LABELS: Record<MembershipTier, string> = {
  Fellowship: "FELLOWSHIP",
  Associate: "ASSOCIATE",
  Mastery: "MASTERY FELLOW",
  Executive: "EXECUTIVE",
  "Honorary Fellow": "HONORARY FELLOW",
  "Honorary Guest": "HONORARY GUEST",
};

export function isMembershipTier(value: unknown): value is MembershipTier {
  return typeof value === "string" && MEMBERSHIP_TIERS.includes(value as MembershipTier);
}
