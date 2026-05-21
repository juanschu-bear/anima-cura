"use client";

import { ReactNode, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

// ─── Stat Card ──────────────────────────────────────────────
export function StatCard({
  label,
  value,
  suffix,
  trend,
  icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  suffix?: string;
  trend?: { value: number; label: string };
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantColors = {
    default: "text-praxis-800",
    success: "text-accent-emerald",
    warning: "text-accent-amber",
    danger: "text-accent-coral",
  };

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-praxis-400 uppercase tracking-wider">
            {label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${variantColors[variant]}`}>
            {typeof value === "number" ? value.toLocaleString() : value}
            {suffix && <span className="text-base font-medium ml-1">{suffix}</span>}
          </p>
          {trend && (
            <p className={`text-xs mt-1 ${trend.value >= 0 ? "text-accent-emerald" : "text-accent-coral"}`}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-praxis-50 flex items-center justify-center text-praxis-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────
export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

// ─── Status Badge (mit Kontext) ─────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const { locale } = useAppStore();
  const variants: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
    bezahlt: "success",
    offen: "info",
    überfällig: "danger",
    teilbezahlt: "warning",
    storniert: "neutral",
    auto: "success",
    manuell: "info",
    abweichung: "warning",
    unklar: "neutral",
    ignoriert: "neutral",
    aktiv: "success",
    abgeschlossen: "neutral",
    pausiert: "warning",
    geplant: "info",
    versendet: "success",
    connected: "success",
    disconnected: "danger",
    update_required: "warning",
    pünktlich: "success",
    verzug: "danger",
    karenz: "warning",
    stufe1: "warning",
    eskalation: "danger",
  };

  const variant = variants[status] || "neutral";
  const key = `status.${status}`;
  const label = t(key, locale) === key ? status : t(key, locale);
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Modal ──────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;

  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-praxis-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-elevated w-full ${widths[size]} max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <h2 className="text-lg font-semibold text-praxis-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-praxis-400 hover:text-praxis-600 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── Dropdown ───────────────────────────────────────────────
export function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <label className="block text-xs font-medium text-praxis-500 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input appearance-none pr-8"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-praxis-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 mx-auto rounded-xl bg-surface-100 flex items-center justify-center text-praxis-400 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-praxis-700">{title}</h3>
      <p className="text-sm text-praxis-400 mt-1 max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-surface-200 ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="stat-card space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
