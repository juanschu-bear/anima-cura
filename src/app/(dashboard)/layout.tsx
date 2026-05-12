"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  CalendarRange,
  AlertTriangle,
  BarChart3,
  Settings,
  Bell,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/uebersicht",   icon: LayoutDashboard, label: "Übersicht" },
  { href: "/zahlungen",    icon: CreditCard,      label: "Zahlungen" },
  { href: "/patienten",    icon: Users,           label: "Patienten" },
  { href: "/ratenplan",    icon: CalendarRange,   label: "Ratenpläne" },
  { href: "/mahnwesen",    icon: AlertTriangle,   label: "Mahnwesen" },
  { href: "/quartal",      icon: BarChart3,       label: "Quartalsbericht" },
  { href: "/einstellungen", icon: Settings,       label: "Einstellungen" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-surface-200 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-surface-200">
          <h1 className="text-lg font-bold text-praxis-800 leading-tight">
            Anima Curo
          </h1>
          <p className="text-xs text-praxis-400 mt-0.5">Intelligent Practice Finance</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/uebersicht" && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-surface-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-praxis-100 flex items-center justify-center text-sm font-semibold text-praxis-600">
              MS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-praxis-800 truncate">Maria Schubert</p>
              <p className="text-xs text-praxis-400">Admin</p>
            </div>
            <button className="text-praxis-400 hover:text-praxis-600 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-surface-200 flex items-center justify-between px-6">
          <div />
          <div className="flex items-center gap-3">
            <button className="relative p-2 text-praxis-400 hover:text-praxis-600 transition-colors rounded-lg hover:bg-surface-50">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-coral" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-50">
          {children}
        </div>
      </main>
    </div>
  );
}
