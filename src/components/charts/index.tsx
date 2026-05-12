"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = {
  primary: "#2d5275",
  emerald: "#2dd4a8",
  coral: "#f97066",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#8b5cf6",
};

// ─── Zahlungsverlauf (Area Chart) ───────────────────────────
export function ZahlungsverlaufChart({ data }: { data: { monat: string; eingänge: number; forderungen: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradEingang" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
            <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradForderung" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.coral} stopOpacity={0.3} />
            <stop offset="95%" stopColor={COLORS.coral} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e8eb" />
        <XAxis dataKey="monat" tick={{ fontSize: 12 }} stroke="#8ba8c4" />
        <YAxis tick={{ fontSize: 12 }} stroke="#8ba8c4" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e8eb", fontSize: "13px" }}
          formatter={(value: number) => [`${value.toLocaleString("de-DE")} €`, ""]}
        />
        <Area type="monotone" dataKey="eingänge" stroke={COLORS.emerald} fill="url(#gradEingang)" strokeWidth={2} name="Eingänge" />
        <Area type="monotone" dataKey="forderungen" stroke={COLORS.coral} fill="url(#gradForderung)" strokeWidth={2} name="Offene Ford." />
        <Legend />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Ratenstatus (Pie Chart) ────────────────────────────────
export function RatenstatusChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          dataKey="value"
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e8eb", fontSize: "13px" }}
          formatter={(value: number) => [value, ""]}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Monatliche Einnahmen (Bar Chart) ───────────────────────
export function MonatseinnahmenChart({ data }: { data: { monat: string; privat: number; kasse: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e8eb" />
        <XAxis dataKey="monat" tick={{ fontSize: 12 }} stroke="#8ba8c4" />
        <YAxis tick={{ fontSize: 12 }} stroke="#8ba8c4" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e8eb", fontSize: "13px" }}
          formatter={(value: number) => [`${value.toLocaleString("de-DE")} €`, ""]}
        />
        <Bar dataKey="privat" fill={COLORS.primary} radius={[4, 4, 0, 0]} name="Privat" />
        <Bar dataKey="kasse" fill={COLORS.blue} radius={[4, 4, 0, 0]} name="Kasse" />
        <Legend />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Matching-Qualität (Bar) ────────────────────────────────
export function MatchingChart({ data }: { data: { status: string; count: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 80, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e8eb" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="#8ba8c4" />
        <YAxis type="category" dataKey="status" tick={{ fontSize: 12 }} stroke="#8ba8c4" width={80} />
        <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e8eb", fontSize: "13px" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Anzahl">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
