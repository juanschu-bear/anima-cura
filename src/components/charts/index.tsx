"use client";

import {
  LineChart,
  Line,
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
  primary: "#4b5f88",
  emerald: "#5a8d3a",
  amber: "#c79a3b",
  blue: "#4b74d8",
  violet: "#5b4de1",
};

// ─── Zahlungsverlauf (Line Chart: Eingang vs Erwartet) ─────
export function ZahlungsverlaufChart({ data }: { data: { monat: string; eingang: number; erwartet: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eceef4" />
        <XAxis dataKey="monat" tick={{ fontSize: 12 }} stroke="#9dacbf" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12 }} stroke="#9dacbf" axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} />
        <Tooltip
          contentStyle={{ borderRadius: "10px", border: "1px solid #e5e8eb", fontSize: "13px" }}
          formatter={(value: number, key: string) => [`${value.toLocaleString("de-DE")}€`, key === "eingang" ? "Eingang" : "Erwartet"]}
        />
        <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }} />
        <Line
          type="monotone"
          dataKey="eingang"
          stroke={COLORS.emerald}
          strokeWidth={2.5}
          dot={{ r: 4, fill: COLORS.emerald }}
          activeDot={{ r: 6 }}
          name="Eingang"
        />
        <Line
          type="monotone"
          dataKey="erwartet"
          stroke={COLORS.violet}
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={false}
          name="Erwartet"
        />
      </LineChart>
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
