import { getPostgresPool } from "@/lib/db";

export const WAITLIST_SUCCESS_MESSAGE =
  "Thank you for joining the waitlist! We will review your access shortly.";

export async function saveWaitlistRequest(name: string, email: string) {
  const result = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO public.waitlist_requests (name, email)
     VALUES ($1, $2)
     ON CONFLICT (lower(email))
     DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, email],
  );
  const request = result.rows[0];
  if (!request) {
    throw new Error("Waitlist request was not returned after saving.");
  }

  console.info("Admin waitlist notification triggered.", {
    recipient: "aarashvoss@gmail.com",
    requestId: request.id,
    registrant: { name, email },
  });
}
