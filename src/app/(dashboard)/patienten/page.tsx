"use client";

import { useState } from "react";
import { usePatienten } from "@/hooks/useData";
import { StatusBadge, EmptyState } from "@/components/ui";
import { Users, Search, Plus } from "lucide-react";
import Link from "next/link";

export default function PatientenPage() {
  const [search, setSearch] = useState("");
  const { patienten, loading } = usePatienten(search);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Patienten</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {patienten.length} Patienten
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Neuer Patient
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
        <input
          type="text"
          placeholder="Patient suchen (Name)..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Patienten Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patienten.map((p) => {
          const offeneRaten = (p.raten || []).filter((r: any) => r.status === "offen" || r.status === "überfällig");
          const offenBetrag = offeneRaten.reduce((s: number, r: any) => s + r.betrag, 0);
          const hatMahnung = (p.raten || []).some((r: any) => r.mahnstufe > 0);

          return (
            <Link
              key={p.id}
              href={`/patienten/${p.id}`}
              className="stat-card hover:shadow-card-hover transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-praxis-100 flex items-center justify-center text-sm font-semibold text-praxis-600 group-hover:bg-praxis-200 transition-colors">
                  {p.vorname[0]}{p.nachname[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-praxis-800 group-hover:text-praxis-600 transition-colors">
                    {p.nachname}, {p.vorname}
                  </p>
                  <p className="text-xs text-praxis-400 mt-0.5">{p.behandlung}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge status={p.behandlung_status} />
                    {hatMahnung && <StatusBadge status="überfällig" />}
                  </div>
                </div>
              </div>

              {offeneRaten.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs text-praxis-400">
                    {offeneRaten.length} offene Rate{offeneRaten.length !== 1 ? "n" : ""}
                  </span>
                  <span className="text-sm font-semibold text-praxis-700">
                    {offenBetrag.toLocaleString("de-DE")} €
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {patienten.length === 0 && !loading && (
        <EmptyState
          icon={<Users size={24} />}
          title="Keine Patienten gefunden"
          description={search ? "Versuche einen anderen Suchbegriff." : "Noch keine Patienten angelegt."}
        />
      )}
    </div>
  );
}
