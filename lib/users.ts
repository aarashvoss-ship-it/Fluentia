import { StudentProfile } from "@/types/lesson";

export interface FluentiaUser {
  id: string;
  name: string;
  email?: string;
  role: "student" | "instructor";
  token?: string;
  profile?: StudentProfile;
}

const student = (
  id: string,
  token: string,
  fullName: string,
  email: string,
  level: string,
  targetGoal: string
): FluentiaUser => ({
  id,
  token,
  name: fullName,
  email,
  role: "student",
  profile: {
    id,
    fullName,
    level,
    targetGoal,
    weaknesses: [],
    teacherNotes: "",
    attendanceRate: 0,
    completedModulesCount: 0,
  },
});

export const INSTRUCTOR_USER: FluentiaUser = {
  id: "avoss-9042",
  token: "avoss-9042",
  name: "AVoss",
  email: "aarashvoss@gmail.com",
  role: "instructor",
};

export const FLUENTIA_USERS: FluentiaUser[] = [
  student("fatemeh-8421", "fatemeh-8421", "Fatemeh Soheilikia", "f.soheilikia.lastqueen2002@gmail.com", "B2 Upper Intermediate", "Advanced fluency"),
  student("navid-3912", "navid-3912", "Navid Kabazi", "navidws@gmail.com", "B1 Intermediate", "Confident conversation"),
  student("yasaman-5184", "yasaman-5184", "Yasaman Sheybani", "yasamansheybani7192@gmail.com", "B2 Upper Intermediate", "Professional writing"),
  student("arezo-7741", "arezo-7741", "Arezo Moghadasi", "arezomoghadasi1996@gmail.com", "B1 Intermediate", "Academic vocabulary"),
  student("morad-3529", "morad-3529", "Morad Abdi Varmazan", "moradabdi@gmail.com", "B1 Intermediate", "Professional writing"),
  student("arash-1024", "arash-1024", "Arash Vossoughi", "aarashvossoughi@gmail.com", "B2 Upper Intermediate", "C1 fluency and presentation"),
  INSTRUCTOR_USER,
];

export interface StudentUser extends FluentiaUser {
  role: "student";
  token: string;
  profile: StudentProfile;
}

type StudentIdentityRecord = {
  id?: string | null;
  user_id?: string | null;
  token?: string | null;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
  profile?: { fullName?: string | null };
};

export function deduplicateStudents<T extends StudentIdentityRecord>(students: readonly T[]): T[] {
  const seenIds = new Set<string>();
  const seenTokens = new Set<string>();
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  return students.filter((student) => {
    const id = student.user_id?.trim() || student.id?.trim() || "";
    const token = student.token?.trim().toLowerCase() || "";
    const email = student.email?.trim().toLowerCase() || "";
    const name = (student.name || student.full_name || student.profile?.fullName || "").trim().replace(/\s+/g, " ").toLowerCase();
    if ((id && seenIds.has(id)) || (token && seenTokens.has(token)) || (email && seenEmails.has(email)) || (name && seenNames.has(name))) return false;
    if (id) seenIds.add(id);
    if (token) seenTokens.add(token);
    if (email) seenEmails.add(email);
    if (name) seenNames.add(name);
    return true;
  });
}

export const STUDENT_USERS: StudentUser[] = deduplicateStudents(FLUENTIA_USERS.filter(
  (user): user is StudentUser => user.role === "student" && Boolean(user.profile && user.token)
));

export function findUser(value?: string | null) {
  if (!value) return undefined;
  return FLUENTIA_USERS.find(
    (user) => user.token === value || user.id === value
  );
}

export const DEFAULT_STUDENT = STUDENT_USERS.find(
  (user) => user.email === "aarashvossoughi@gmail.com"
) || STUDENT_USERS[0];