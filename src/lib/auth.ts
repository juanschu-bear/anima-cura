import type { User } from "@supabase/supabase-js";
import { effektiveStufe, modulFuerPfad, type ProfilPermissions } from "./permissions";

export type AppRole = "admin" | "verwaltung" | "lesezugriff" | "patient";

export interface AuthenticatedAppUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  permissions?: ProfilPermissions;
}

export interface UserProfileRecord {
  display_name?: string | null;
  full_name?: string | null;
  role?: string | null;
  permissions?: ProfilPermissions;
}

export interface DefaultAuthUser {
  email: string;
  role: AppRole;
  fullName: string;
}

export const DEFAULT_AUTH_USERS: DefaultAuthUser[] = [
  {
    email: "maria@praxis-schubert.de",
    role: "admin",
    fullName: "Dr. Maria Schubert",
  },
  {
    email: "sabine@praxis-schubert.de",
    role: "verwaltung",
    fullName: "Sabine",
  },
  {
    email: "empfang@praxis-schubert.de",
    role: "lesezugriff",
    fullName: "Empfang",
  },
];

const DASHBOARD_ROUTE_ACCESS: Array<{ path: string; roles: AppRole[] }> = [
  { path: "/uebersicht", roles: ["admin", "verwaltung", "lesezugriff"] },
  { path: "/zahlungen", roles: ["admin", "verwaltung"] },
  { path: "/kasse", roles: ["admin", "verwaltung"] },
  { path: "/patienten", roles: ["admin", "verwaltung", "lesezugriff"] },
  { path: "/ratenplan", roles: ["admin", "verwaltung"] },
  { path: "/mahnwesen", roles: ["admin", "verwaltung"] },
  { path: "/quartal", roles: ["admin", "verwaltung", "lesezugriff"] },
  { path: "/berichte", roles: ["admin", "verwaltung", "lesezugriff"] },
  { path: "/rechnungen", roles: ["admin", "verwaltung"] },
  { path: "/offene-posten", roles: ["admin", "verwaltung"] },
  { path: "/intelligence", roles: ["admin", "verwaltung"] },
  { path: "/nachrichten", roles: ["admin", "verwaltung"] },
  { path: "/automatisierungen", roles: ["admin", "verwaltung"] },
  { path: "/import", roles: ["admin", "verwaltung"] },
  { path: "/einstellungen", roles: ["admin"] },
];

export function extractAppRole(value: unknown): AppRole | null {
  if (value === "admin" || value === "verwaltung" || value === "lesezugriff" || value === "patient") {
    return value;
  }
  return null;
}

export function getUserRole(user: Pick<User, "app_metadata" | "user_metadata"> | null | undefined): AppRole | null {
  if (!user) return null;
  return (
    extractAppRole(user.app_metadata?.role) ||
    extractAppRole(user.user_metadata?.role) ||
    null
  );
}

export function getUserFullName(user: Pick<User, "email" | "user_metadata"> | null | undefined): string {
  const fromMetadata =
    typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;

  if (fromMetadata && fromMetadata.trim()) return fromMetadata.trim();
  if (user?.email) return user.email.split("@")[0];
  return "Anima Cura";
}

export function buildAuthenticatedAppUser(user: User): AuthenticatedAppUser {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: getUserFullName(user),
    role: getUserRole(user) ?? "lesezugriff",
  };
}

export function getProfileDisplayName(profile: UserProfileRecord | null | undefined): string | null {
  const value =
    typeof profile?.display_name === "string" && profile.display_name.trim()
      ? profile.display_name
      : typeof profile?.full_name === "string" && profile.full_name.trim()
      ? profile.full_name
      : null;

  return value ? value.trim() : null;
}

export function canAccessPath(role: AppRole, pathname: string, permissions?: ProfilPermissions): boolean {
  const modul = modulFuerPfad(pathname);
  if (modul) return effektiveStufe(role, permissions ?? null, modul) !== "keine";

  const accessEntry = [...DASHBOARD_ROUTE_ACCESS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`));

  return accessEntry ? accessEntry.roles.includes(role) : false;
}

export function getAccessiblePaths(role: AppRole): string[] {
  return DASHBOARD_ROUTE_ACCESS
    .filter((entry) => entry.roles.includes(role))
    .map((entry) => entry.path);
}

export function getDefaultDashboardPath(role: AppRole): string {
  return getAccessiblePaths(role)[0] ?? "/uebersicht";
}

export function isReadOnlyRole(role: AppRole): boolean {
  return role === "lesezugriff";
}
