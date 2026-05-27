import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const DASHBOARD_MATCHERS = [
  "/uebersicht",
  "/zahlungen",
  "/patienten",
  "/ratenplan",
  "/mahnwesen",
  "/quartal",
  "/automatisierungen",
  "/import",
  "/einstellungen",
];

const PATIENT_MATCHERS = [
  "/patient/portal",
];

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")
    );
}

function isDashboardPath(pathname: string) {
  return DASHBOARD_MATCHERS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isPatientPath(pathname: string) {
  return PATIENT_MATCHERS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieMutation[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isDashboard = isDashboardPath(pathname);

  const isPatient = isPatientPath(pathname);

  // Redirect logged-in praxis users away from praxis login
  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/uebersicht", request.url));
  }

  // Redirect logged-in patient users away from patient login
  if (pathname === "/patient/login" && user) {
    return NextResponse.redirect(new URL("/patient/portal", request.url));
  }

  // Protect dashboard routes
  if (isDashboard && !hasSupabaseAuthCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath && nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isDashboard && !user) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath && nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Protect patient portal routes
  if (isPatient && !hasSupabaseAuthCookie(request)) {
    return NextResponse.redirect(new URL("/patient/login", request.url));
  }

  if (isPatient && !user) {
    return NextResponse.redirect(new URL("/patient/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/login", "/uebersicht/:path*", "/zahlungen/:path*", "/patienten/:path*", "/ratenplan/:path*", "/mahnwesen/:path*", "/quartal/:path*", "/automatisierungen/:path*", "/import/:path*", "/einstellungen/:path*"],
  matcher: ["/login", "/patient/login", "/patient/portal/:path*", "/uebersicht/:path*", "/zahlungen/:path*", "/patienten/:path*", "/ratenplan/:path*", "/mahnwesen/:path*", "/quartal/:path*", "/automatisierungen/:path*", "/import/:path*", "/einstellungen/:path*"],
};
