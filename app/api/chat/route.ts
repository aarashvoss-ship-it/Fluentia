import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/auth";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type MessageRow = {
  id: string;
  student_id: string | null;
  instructor_id: string;
  sender_id: string;
  receiver_id: string;
  tab_type: "active" | "support";
  content: string;
  created_at: string;
};

const MAX_MESSAGE_LENGTH = 4000;

async function resolveInstructorId(identifier?: string | null) {
  const result = await getPostgresPool().query<{ id: string }>(
    `SELECT id::text
     FROM public.profiles
     WHERE role = 'instructor'
       AND ($1::text IS NULL OR id::text = $1 OR token = $1 OR email = $1 OR full_name = $1)
     ORDER BY CASE WHEN $1::text IS NOT NULL AND (id::text = $1 OR token = $1 OR email = $1 OR full_name = $1) THEN 0 ELSE 1 END,
              created_at
     LIMIT 1`,
    [identifier || null],
  );
  return result.rows[0]?.id || null;
}

async function resolveStudentId(identifier: string) {
  const result = await getPostgresPool().query<{ id: string }>(
    `SELECT id::text
     FROM public.profiles
     WHERE role = 'student'
       AND (id::text = $1 OR token = $1)
     LIMIT 1`,
    [identifier],
  );
  return result.rows[0]?.id || null;
}

export async function GET() {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to load chat messages." }, { status: 401 });
  if (user.role !== "student" && user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "You cannot load chat messages." }, { status: 403 });
  }

  try {
    await initializeDatabase();
    const pool = getPostgresPool();
    if (user.role === "student") {
      const profile = await pool.query<{ assigned_instructor: string | null }>(
        "SELECT assigned_instructor FROM public.profiles WHERE id = $1",
        [user.id],
      );
      const instructorId = await resolveInstructorId(profile.rows[0]?.assigned_instructor);
      if (!instructorId) {
        return NextResponse.json({ messages: [], instructorId: null, currentUserId: user.id });
      }
      const result = await pool.query<MessageRow>(
        `SELECT id, student_id, instructor_id, sender_id, receiver_id, tab_type, content, created_at
         FROM public.messages
         WHERE instructor_id = $1
           AND (student_id = $2 OR (
             student_id IS NULL
             AND ((sender_id = $2 AND receiver_id = $1) OR (sender_id = $1 AND receiver_id = $2))
           ))
         ORDER BY created_at ASC`,
        [instructorId, user.id],
      );
      return NextResponse.json({ messages: result.rows, instructorId, currentUserId: user.id });
    }

    const result = await pool.query<MessageRow>(
      `SELECT id,
              COALESCE(student_id, CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END) AS student_id,
              instructor_id, sender_id, receiver_id, tab_type, content, created_at
       FROM public.messages
       WHERE instructor_id = $1
       ORDER BY created_at ASC`,
      [user.id],
    );
    return NextResponse.json({ messages: result.rows, instructorId: user.id, currentUserId: user.id });
  } catch (error) {
    logDatabaseError("PostgreSQL chat load failed:", error);
    return NextResponse.json({ error: "Unable to load chat messages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Chat requests must come from this site." }, { status: 403 });
  }
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to send chat messages." }, { status: 401 });
  if (user.role !== "student" && user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "You cannot send chat messages." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide a valid chat message." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide a valid chat message." }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const tabType = body.tab === "support" ? "support" : body.tab === "instructor" || body.tab === "active" ? "active" : null;
  const studentIdentifier = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!content || content.length > MAX_MESSAGE_LENGTH || !tabType) {
    return NextResponse.json({ error: "Enter a message of up to 4000 characters." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    let studentId: string | null = null;
    let instructorId: string;
    let receiverId: string;
    if (user.role === "student") {
      const profile = await getPostgresPool().query<{ assigned_instructor: string | null }>(
        "SELECT assigned_instructor FROM public.profiles WHERE id = $1",
        [user.id],
      );
      instructorId = await resolveInstructorId(profile.rows[0]?.assigned_instructor) || "";
      if (!instructorId) return NextResponse.json({ error: "No instructor is available for this chat." }, { status: 409 });
      studentId = user.id;
      receiverId = instructorId;
    } else {
      instructorId = user.id;
      if (studentIdentifier) {
        studentId = await resolveStudentId(studentIdentifier);
        if (!studentId) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
      }
      if (tabType === "active" && !studentId) {
        return NextResponse.json({ error: "Choose a student before sending a message." }, { status: 400 });
      }
      receiverId = studentId || user.id;
    }

    const result = await getPostgresPool().query<MessageRow>(
      `INSERT INTO public.messages
         (student_id, instructor_id, sender_id, receiver_id, tab_type, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, student_id, instructor_id, sender_id, receiver_id, tab_type, content, created_at`,
      [studentId, instructorId, user.id, receiverId, tabType, content],
    );
    const message = result.rows[0];
    if (!message) throw new Error("Inserted chat message was not returned.");
    return NextResponse.json({ message, currentUserId: user.id }, { status: 201 });
  } catch (error) {
    logDatabaseError("PostgreSQL chat send failed:", error);
    return NextResponse.json({ error: "Unable to send chat message." }, { status: 500 });
  }
}
