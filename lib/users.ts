import { StudentProfile } from "@/types/lesson";

export interface FluentiaUser {
  id: string;
  name: string;
  role: "student" | "instructor";
  token?: string;
  profile?: StudentProfile;
}

const student = (
  id: string,
  token: string,
  fullName: string,
  level: string,
  targetGoal: string
): FluentiaUser => ({
  id,
  token,
  name: fullName,
  role: "student",
  profile: {
    id,
    fullName,
    level,
    targetGoal,
    weaknesses: ["Complex prepositions", "Nuanced idioms", "Tone consistency"],
    teacherNotes: "Add instructor notes for this student.",
    attendanceRate: 0,
    completedModulesCount: 0,
  },
});

export const FLUENTIA_USERS: FluentiaUser[] = [
  student("std-01", "fateme-s", "Fateme Soheilikia", "B2 Upper Intermediate", "Advanced fluency"),
  student("std-02", "navid-k", "Navid Khabazi", "B1 Intermediate", "Confident conversation"),
  student("std-03", "yasaman-s", "Yasaman Sheybani", "B2 Upper Intermediate", "Professional writing"),
  student("std-04", "arezo-m", "Arezo Moghaddasi", "B1 Intermediate", "Academic vocabulary"),
  student("std-05", "arash-test", "Arash Test", "B2 Upper Intermediate", "C1 fluency and presentation"),
  { id: "instructor-avoss", name: "AVoss", role: "instructor" },
];

export const STUDENT_USERS = FLUENTIA_USERS.filter(
  (user): user is FluentiaUser & { profile: StudentProfile; token: string } =>
    user.role === "student" && Boolean(user.profile && user.token)
);

export type StudentUser = (typeof STUDENT_USERS)[number];

export function findUser(value?: string | null) {
  if (!value) return undefined;
  return FLUENTIA_USERS.find(
    (user) => user.token === value || user.id === value
  );
}

export const DEFAULT_STUDENT = STUDENT_USERS.find(
  (user) => user.token === "arash-test"
) || STUDENT_USERS[0];