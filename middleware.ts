import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isInstructorRoute = pathname === "/instructor" || pathname.startsWith("/instructor/");
  const isLessonRoute = pathname === "/lessons" || pathname.startsWith("/lessons/");
  const isProtectedRoute = isDashboardRoute || isInstructorRoute || isLessonRoute;

  if (!isProtectedRoute) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  if (isInstructorRoute && user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (isDashboardRoute && (user.role === "instructor" || user.role === "admin")) {
    return NextResponse.redirect(new URL("/instructor", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
