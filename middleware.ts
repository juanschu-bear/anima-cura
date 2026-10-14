import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getDefaultDashboardPath } from "@/lib/auth";
import { safePatientTarget } from "@/lib/patient-navigation";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const DASHBOARD_MATCHERS = [
  "/uebersicht",
  "/animapay",
  "/finanzen",
  "/zahlungen",
  "/kasse",
  "/patienten",
  "/ratenplan",
  "/mahnwesen",
  "/quartal",
  "/berichte",
  "/rechnungen",
  "/offene-posten",
  "/intelligence",
  "/nachrichten",
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

function redirectWithCookies(destination: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(destination);
  response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

function patientLoginUrl(request: NextRequest) {
  const loginUrl = new URL("/patient/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return loginUrl;
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
    error: authError,
  } = await supabase.auth.getUser();

  if (!user && authError?.code === "refresh_token_not_found") {
    request.cookies.getAll().filter(cookie => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
      .forEach(cookie => response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 }));
  }

  const { pathname, search } = request.nextUrl;
  const isDashboard = isDashboardPath(pathname);
  const isPatient = isPatientPath(pathname);

  // If we have a user, check their role via user_profiles
  let userRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = profile?.role || null;
  }

  // Redirect logged-in praxis users away from praxis login
  if (pathname === "/login" && user && userRole && userRole !== "patient") {
    return redirectWithCookies(new URL(getDefaultDashboardPath(userRole as never), request.url), response);
  }

  // Redirect logged-in patient users away from patient login
  if (pathname === "/patient/login" && user && userRole === "patient") {
    return redirectWithCookies(new URL(safePatientTarget(request.nextUrl.searchParams.get("next")), request.url), response);
  }

  // Patient trying to access dashboard -> redirect to patient portal
  if (isDashboard && user && userRole === "patient") {
    return redirectWithCookies(new URL("/patient/portal", request.url), response);
  }

  // Praxis user trying to access patient portal -> redirect to dashboard
  if (isPatient && user && userRole && userRole !== "patient") {
    return redirectWithCookies(new URL(getDefaultDashboardPath(userRole as never), request.url), response);
  }

  // Protect dashboard routes - no auth
  if (isDashboard && !hasSupabaseAuthCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath && nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return redirectWithCookies(loginUrl, response);
  }

  if (isDashboard && !user) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath && nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return redirectWithCookies(loginUrl, response);
  }

  // Protect patient portal routes - no auth
  if (isPatient && !hasSupabaseAuthCookie(request)) {
    return redirectWithCookies(patientLoginUrl(request), response);
  }

  if (isPatient && !user) {
    return redirectWithCookies(patientLoginUrl(request), response);
  }

  return response;
}

export const config = {
  matcher: ["/login", "/patient/login", "/patient/portal/:path*", "/uebersicht/:path*", "/animapay/:path*", "/finanzen/:path*", "/zahlungen/:path*", "/kasse/:path*", "/patienten/:path*", "/ratenplan/:path*", "/mahnwesen/:path*", "/quartal/:path*", "/berichte/:path*", "/rechnungen/:path*", "/offene-posten/:path*", "/intelligence/:path*", "/nachrichten/:path*", "/automatisierungen/:path*", "/import/:path*", "/einstellungen/:path*"],
};
