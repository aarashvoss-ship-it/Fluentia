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
  student("fatemeh-8421", "fatemeh-8421", "Fatemeh Soheilikia", "B2 Upper Intermediate", "Advanced fluency"),
  student("navid-3912", "navid-3912", "Navid Khabazi", "B1 Intermediate", "Confident conversation"),
  student("yasaman-5184", "yasaman-5184", "Yasaman Sheybani", "B2 Upper Intermediate", "Professional writing"),
  student("arezo-7741", "arezo-7741", "Arezo Moghaddasi", "B1 Intermediate", "Academic vocabulary"),
  student("arash-1024", "arash-1024", "Arash Test", "B2 Upper Intermediate", "C1 fluency and presentation"),
  student("niki-4932", "niki-4932", "Niki Dahmardeh", "B2 Upper Intermediate", "Advanced fluency"),
  student("nahal-6184", "nahal-6184", "Nahal Dahmardeh", "B1 Intermediate", "Confident conversation"),
  student("morad-3529", "morad-3529", "Morad Abdi Varmazan", "B1 Intermediate", "Professional writing"),
  student("test-1001", "test-1001", "ST Test01", "B1 Intermediate", "Fluency"),
  student("test-1002", "test-1002", "ST Test02", "B1 Intermediate", "Fluency"),
  student("termeh-5823", "termeh-5823", "Termeh Besharati", "B1 Intermediate", "Fluency"),
  student("ryan-9147", "ryan-9147", "Ryan Rezaie", "B1 Intermediate", "Fluency"),
  { id: "instructor-avoss", token: "avoss-9042", name: "AVoss", role: "instructor" },
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
  (user) => user.token === "arash-1024"
) || STUDENT_USERS[0];