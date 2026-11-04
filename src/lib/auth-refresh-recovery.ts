export function isMissingRefreshTokenError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "refresh_token_not_found",
  );
}

export function isScribePath(pathname: string) {
  return pathname === "/scribe" || pathname.startsWith("/scribe/");
}

export function isProtectedScribePath(pathname: string) {
  return isScribePath(pathname) && pathname !== "/scribe/login";
}
