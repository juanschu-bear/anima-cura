"use client";

import { useEffect, useState } from "react";
import { X, History, RotateCcw, Eye } from "lucide-react";
import type { Workflow, WorkflowVersion } from "./types";
import { readVersions } from "./storage";

interface Props {
  workflow: Workflow;
  onClose: () => void;
  onRestore: (snapshot: Workflow) => void;
}

export function VersionHistoryDrawer({ workflow, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const v = await readVersions(workflow.id);
      setVersions(v);
      setLoading(false);
    })();
  }, [workflow.id]);

  const preview = versions.find((v) => v.id === previewId);

  return (
    <div className="wf-drawer-backdrop" onClick={onClose}>
      <aside className="wf-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="wf-drawer-head">
          <div className="flex items-center gap-2">
            <History size={16} style={{ color: "var(--ac-primary)" }} />
            <h3 className="text-[16px] font-bold" style={{ color: "var(--ac-text)" }}>Versionen</h3>
          </div>
          <button onClick={onClose} className="wf-iconbtn" aria-label="Schließen">
            <X size={15} />
          </button>
        </header>

        <div className="wf-drawer-body">
          {loading && <p className="wf-empty-inline">Lade …</p>}
          {!loading && versions.length === 0 && (
            <p className="wf-empty-inline">
              Noch keine Versionen — Versionen entstehen beim Speichern des Workflows.
            </p>
          )}
          {versions.map((v) => (
            <div key={v.id} className={`wf-version-row ${previewId === v.id ? "wf-version-row-active" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="wf-version-badge">v{v.version}</span>
                  <p className="wf-version-time">
                    {new Date(v.created_at).toLocaleString("de-DE")}
                  </p>
                </div>
                {v.note && <p className="wf-version-note">{v.note}</p>}
                <p className="wf-version-stats">
                  {(v.snapshot?.nodes?.length ?? 0)} Nodes · {(v.snapshot?.edges?.length ?? 0)} Verbindungen
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="wf-iconbtn"
                  title="Vorschau"
                  onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
                >
                  <Eye size={14} />
                </button>
                <button
                  className="wf-primary-btn"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                  onClick={() => {
                    if (confirm(`Workflow auf Version ${v.version} zurücksetzen?`)) {
                      onRestore(v.snapshot as Workflow);
                      onClose();
                    }
                  }}
                >
                  <RotateCcw size={12} /> Wiederherstellen
                </button>
              </div>
            </div>
          ))}

          {preview && (
            <div className="wf-version-preview">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ac-text-mute)" }}>
                Vorschau v{preview.version}
              </p>
              <pre>{JSON.stringify(preview.snapshot, null, 2)}</pre>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
