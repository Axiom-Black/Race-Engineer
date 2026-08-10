import React, { useState, useEffect } from "react";

/* ============================================================
   ByteCraft Racing — Host Website
   Marketing front + logged-in app shell with 10 agent panels
   Lead identity: ByteCraft Racing (pink #FF2D78, silver-grey tiers)
   Parent: Axiom Black LLC (footer)
   ============================================================ */

const C = {
  pink: "#FF2D78",
  pinkDim: "#C7235E",
  ink: "#0B0C0E",
  panel: "#141619",
  panelHi: "#1B1E22",
  line: "#2A2E34",
  t1: "#E8EAED",
  t2: "#B0B5BB",
  t3: "#6E7278",
  abOrange: "#FF8710",
  green: "#12BB1E",
  amber: "#FFB020",
  amberRef: "#FFB020",
};

const FONT = "'DM Sans', 'Helvetica Neue', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

const AGENTS = [
  { id: "data", n: "Data Analytics", d: "Display & inference across the session", k: "ANL" },
  { id: "aero", n: "Aerodynamics", d: "Aero balance and its pace contribution", k: "AER" },
  { id: "tire", n: "Tire", d: "Temps, pressures, slip, wear vs. ideal", k: "TIR" },
  { id: "power", n: "Powertrain", d: "Fuel level & powertrain strategy", k: "PWR" },
  { id: "tele", n: "Telemetry", d: "Lap vs. ideal-lap deltas for feedback", k: "TEL" },
  { id: "strat", n: "Strategy", d: "Session approach vs. goal & baseline", k: "STR" },
  { id: "env", n: "Environment", d: "Weather, time-of-day, track condition", k: "ENV" },
  { id: "kpi", n: "KPI / Optimizer", d: "Performance-driving KPI analysis", k: "KPI" },
  { id: "synth", n: "Synthesizer", d: "Consolidates the unified engineer report", k: "SYN" },
  { id: "user", n: "User Agent", d: "Interprets intent, formats the response", k: "USR" },
];

const CTX = {
  Simulator: ["Le Mans Ultimate"],
  Class: ["Hypercar", "LMP2", "LMP3", "LMGT3", "GTE"],
  Track: ["Circuit Zolder", "Le Mans", "Spa-Francorchamps", "Monza", "Bahrain", "Fuji", "Imola"],
  Session: ["Practice", "Qualifying", "Race", "Testing"],
};

const RUN_TIERS = [
  { n: "Quick", d: "Single-agent check", weight: 1 },
  { n: "Standard", d: "Core specialists + synthesis", weight: 2 },
  { n: "Deep", d: "Full ten-agent analysis", weight: 3 },
];

/* Progression tiers — gap-to-ideal thresholds (% off ideal), user-configurable */
const TIERS = [
  { n: "Elite", max: 0.5, color: C.pink },
  { n: "Competitive", max: 1.5, color: "#C77DFF" },
  { n: "Developing", max: 3.0, color: C.amberRef },
  { n: "Foundation", max: Infinity, color: C.t3 },
];
function tierFor(gapPct, tiers) {
  return tiers.find((t) => gapPct <= t.max) || tiers[tiers.length - 1];
}

/* Seeded Sim × Class × Track × Session rows with an improving trend */
const PROGRESSION = [
  { track: "Circuit Zolder", cls: "LMGT3", session: "Qualifying", gap: 0.42, trend: [4.1, 3.3, 2.6, 1.9, 1.2, 0.8, 0.42] },
  { track: "Le Mans", cls: "Hypercar", session: "Race", gap: 1.15, trend: [3.8, 3.1, 2.7, 2.0, 1.6, 1.3, 1.15] },
  { track: "Spa-Francorchamps", cls: "LMP2", session: "Qualifying", gap: 2.40, trend: [5.0, 4.4, 3.9, 3.2, 2.9, 2.6, 2.40] },
  { track: "Monza", cls: "GTE", session: "Race", gap: 0.88, trend: [2.9, 2.5, 2.0, 1.6, 1.2, 1.0, 0.88] },
  { track: "Imola", cls: "LMP3", session: "Practice", gap: 3.60, trend: [6.2, 5.5, 5.0, 4.5, 4.1, 3.8, 3.60] },
  { track: "Bahrain", cls: "LMGT3", session: "Qualifying", gap: 1.95, trend: [4.6, 4.0, 3.4, 2.9, 2.4, 2.1, 1.95] },
  { track: "Fuji", cls: "Hypercar", session: "Race", gap: 0.31, trend: [3.0, 2.3, 1.7, 1.1, 0.7, 0.45, 0.31] },
];

/* Published corner dossiers — keyed track|class, Zone A–E structure */
const DOSSIERS = {
  "Circuit Zolder|LMGT3": {
    published: 8,
    total: 10,
    corners: [
      { n: 1, name: "Sterrewachtbocht", entry: 198, gear: 4, entryPos: "Wide on the right, brake in a straight line", apexPos: "Tight to the inside kerb, late apex", exitPos: "Track-out fully, settle for the run to T2", risks: [["Lockup", "Heavy braking zone on cold tires"], ["Kerb", "Inside kerb unsettles the rear on exit"]], load: { FL: "High", FR: "High", RL: "Med", RR: "Med" } },
      { n: 2, name: "Lucien Bianchibocht", entry: 96, gear: 2, entryPos: "Left third, slow entry, patience", apexPos: "Very late apex, rotate on throttle", exitPos: "Use all the road, prioritise exit speed", risks: [["Understeer", "Easy to run wide mid-corner"], ["Traffic", "Blind for cars closing behind"]], load: { FL: "High", FR: "Med", RL: "Med", RR: "Low" } },
      { n: 3, name: "Gilles Villeneuvebocht", entry: 142, gear: 3, entryPos: "Centre-track, trail brake to the apex", apexPos: "Single clean apex, minimal steering", exitPos: "Short shift, protect the rears", risks: [["Snap", "Rear steps out if throttle too early"]], load: { FL: "Med", FR: "High", RL: "Low", RR: "Med" } },
    ],
  },
};

/* ---------- shared bits ---------- */
function Logo({ size = 22 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: C.pink,
          position: "relative",
          flexShrink: 0,
          boxShadow: `0 0 18px ${C.pink}55`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: size * 0.28,
            border: `2px solid ${C.ink}`,
            borderRadius: 1,
          }}
        />
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 900, letterSpacing: "-0.02em", fontSize: 15, color: C.t1 }}>
          BYTECRAFT<span style={{ color: C.pink }}> RACING</span>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, tone = "pink" }) {
  const bg = tone === "pink" ? `${C.pink}1A` : `${C.t3}22`;
  const fg = tone === "pink" ? C.pink : C.t2;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: "0.08em",
        color: fg,
        background: bg,
        border: `1px solid ${fg}33`,
        padding: "3px 8px",
        borderRadius: 4,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ============================================================
   MARKETING LANDING
   ============================================================ */
function Landing({ onEnter }) {
  return (
    <div>
      {/* nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          borderBottom: `1px solid ${C.line}`,
          position: "sticky",
          top: 0,
          background: `${C.ink}E6`,
          backdropFilter: "blur(10px)",
          zIndex: 20,
        }}
      >
        <Logo />
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          {["Platform", "Agents", "Pricing"].map((x) => (
            <span key={x} style={{ color: C.t2, fontSize: 14, cursor: "pointer" }}>
              {x}
            </span>
          ))}
          <button onClick={onEnter} style={btn("ghost")}>Sign in</button>
          <button onClick={onEnter} style={btn("solid")}>Enter the garage</button>
        </div>
      </nav>

      {/* hero */}
      <section style={{ padding: "84px 28px 70px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <Pill>Le Mans Ultimate</Pill>
          <Pill tone="grey">10-agent system</Pill>
          <Pill tone="grey">MoTeC telemetry</Pill>
        </div>
        <h1
          style={{
            fontSize: 62,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            fontWeight: 900,
            margin: 0,
            color: C.t1,
            maxWidth: 880,
          }}
        >
          They coach the driver.
          <br />
          We <span style={{ color: C.pink }}>engineer the car.</span>
        </h1>
        <p style={{ fontSize: 19, color: C.t2, maxWidth: 620, marginTop: 24, lineHeight: 1.5 }}>
          The Race Engineering Agent reads your telemetry, reasons about aero, tires,
          powertrain, and strategy, then hands you one decision-ready report — not just a
          faster line.
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
          <button onClick={onEnter} style={{ ...btn("solid"), padding: "13px 24px", fontSize: 15 }}>
            Open the dashboard
          </button>
          <button style={{ ...btn("ghost"), padding: "13px 24px", fontSize: 15 }}>
            Watch a run
          </button>
        </div>

        {/* hero strip — agent grid teaser */}
        <div
          style={{
            marginTop: 56,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
          }}
        >
          {AGENTS.map((a) => (
            <div
              key={a.id}
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: "14px 12px",
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.pink, letterSpacing: "0.1em" }}>
                {a.k}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginTop: 6 }}>{a.n}</div>
            </div>
          ))}
        </div>
      </section>

      {/* value row */}
      <section style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {[
            ["Curated corner dossiers", "Per-corner, per-class engineering data — entry speed, gear, positioning, per-tire load."],
            ["Ideal-lap deltas", "Every lap measured against a session-type-aware ideal, not a generic fast lap."],
            ["Session-aware strategy", "Qualifying extracts lap time. Race protects tires and consistency. The agent knows which."],
          ].map(([t, d], i) => (
            <div
              key={t}
              style={{
                padding: "34px 26px",
                borderLeft: i ? `1px solid ${C.line}` : "none",
              }}
            >
              <div style={{ fontWeight: 800, color: C.t1, fontSize: 16 }}>{t}</div>
              <div style={{ color: C.t2, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* footer — Axiom Black parent */}
      <footer style={{ padding: "30px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <Logo size={18} />
          <div style={{ fontSize: 12, color: C.t3, fontFamily: MONO }}>
            A product of{" "}
            <span style={{ color: C.abOrange }}>AXIOM BLACK</span> · The ByteCraft Company
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================
   APP SHELL (logged in)
   ============================================================ */
function AppShell({ onExit, isAdmin, setIsAdmin }) {
  const [ctx, setCtx] = useState({
    Simulator: CTX.Simulator[0],
    Class: CTX.Class[0],
    Track: CTX.Track[0],
    Session: CTX.Session[2],
  });
  const [tier, setTier] = useState(RUN_TIERS[1]);
  const [active, setActive] = useState(AGENTS[0].id);
  const [view, setView] = useState("run"); // run | notes | history | progression
  const [tierConfig, setTierConfig] = useState(TIERS);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* sidebar */}
      <aside
        style={{
          width: 220,
          borderRight: `1px solid ${C.line}`,
          background: C.panel,
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ paddingLeft: 6, marginBottom: 24 }}>
          <Logo size={18} />
        </div>
        <NavItem label="Engineering Run" active={view === "run"} onClick={() => setView("run")} />
        <NavItem label="Track Notes" active={view === "notes"} onClick={() => setView("notes")} />
        <NavItem label="Session History" active={view === "history"} onClick={() => setView("history")} />
        <NavItem label="Progression" active={view === "progression"} onClick={() => setView("progression")} />
        <div style={{ flex: 1 }} />
        <div
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO, marginBottom: 8 }}>
            VIEW MODE
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["User", "Admin"].map((r) => {
              const on = (r === "Admin") === isAdmin;
              return (
                <button
                  key={r}
                  onClick={() => setIsAdmin(r === "Admin")}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: "6px 0",
                    borderRadius: 6,
                    border: `1px solid ${on ? C.pink : C.line}`,
                    background: on ? `${C.pink}1A` : "transparent",
                    color: on ? C.pink : C.t2,
                    cursor: "pointer",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={onExit} style={{ ...btn("ghost"), width: "100%" }}>
          Sign out
        </button>
      </aside>

      {/* main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* context bar — shown for run + track notes (both context-scoped) */}
        {(view === "run" || view === "notes") && (
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "14px 22px",
              borderBottom: `1px solid ${C.line}`,
              background: C.panelHi,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            {Object.keys(CTX).map((k) => (
              <Selector
                key={k}
                label={k}
                value={ctx[k]}
                options={CTX[k]}
                onChange={(v) => setCtx({ ...ctx, [k]: v })}
              />
            ))}
            <div style={{ flex: 1 }} />
            {view === "run" && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {RUN_TIERS.map((t) => (
                  <button
                    key={t.n}
                    onClick={() => setTier(t)}
                    title={t.d}
                    style={{
                      fontSize: 12,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${tier.n === t.n ? C.pink : C.line}`,
                      background: tier.n === t.n ? `${C.pink}1A` : "transparent",
                      color: tier.n === t.n ? C.pink : C.t2,
                      cursor: "pointer",
                      fontFamily: MONO,
                    }}
                  >
                    {t.n}
                  </button>
                ))}
                <button style={{ ...btn("solid"), marginLeft: 6 }}>Run analysis</button>
              </div>
            )}
          </div>
        )}

        {/* ENGINEERING RUN — agent workspace */}
        {view === "run" && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div
              style={{
                width: 300,
                borderRight: `1px solid ${C.line}`,
                overflowY: "auto",
                padding: 14,
              }}
            >
              <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO, marginBottom: 10, letterSpacing: "0.08em" }}>
                AGENT TEAM · {tier.n.toUpperCase()} RUN
              </div>
              {AGENTS.map((a) => (
                <AgentRow
                  key={a.id}
                  a={a}
                  active={active === a.id}
                  onClick={() => setActive(a.id)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
            <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
              <AgentDetail a={AGENTS.find((x) => x.id === active)} ctx={ctx} isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {/* TRACK NOTES — published dossier reader */}
        {view === "notes" && <TrackNotesReader ctx={ctx} isAdmin={isAdmin} />}

        {/* PROGRESSION */}
        {view === "progression" && (
          <ProgressionTracker tierConfig={tierConfig} setTierConfig={setTierConfig} isAdmin={isAdmin} />
        )}

        {/* SESSION HISTORY (placeholder) */}
        {view === "history" && (
          <div style={{ padding: 26, color: C.t2 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.t1 }}>Session History</h2>
            <div style={{ fontSize: 14, marginTop: 8 }}>
              User-owned lap and session records populate here once the MoTeC ingestion layer lands.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "9px 10px",
        borderRadius: 6,
        fontSize: 14,
        color: active ? C.t1 : C.t2,
        background: active ? C.panelHi : "transparent",
        borderLeft: active ? `2px solid ${C.pink}` : "2px solid transparent",
        marginBottom: 2,
        cursor: "pointer",
      }}
    >
      {label}
    </div>
  );
}

function Selector({ label, value, options, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, color: C.t3, fontFamily: MONO, marginBottom: 4, letterSpacing: "0.08em" }}>
        {label.toUpperCase()}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.panel,
          color: C.t1,
          border: `1px solid ${C.line}`,
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily: FONT,
          minWidth: 150,
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function AgentRow({ a, active, onClick, isAdmin }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 12px",
        borderRadius: 8,
        border: `1px solid ${active ? C.pink : C.line}`,
        background: active ? `${C.pink}12` : C.panel,
        marginBottom: 8,
        cursor: "pointer",
        display: "flex",
        gap: 11,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: active ? C.pink : C.t3,
          border: `1px solid ${active ? C.pink : C.line}`,
          borderRadius: 4,
          padding: "4px 5px",
          letterSpacing: "0.06em",
        }}
      >
        {a.k}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{a.n}</div>
        <div style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {a.d}
        </div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: C.t3, display: "inline-block" }} />
      </div>
    </div>
  );
}

function AgentDetail({ a, ctx, isAdmin }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: C.t1, letterSpacing: "-0.02em" }}>
          {a.n}
        </h2>
        <Pill>{a.k}</Pill>
      </div>
      <div style={{ color: C.t2, fontSize: 15 }}>{a.d}</div>

      <div style={{ fontSize: 12, color: C.t3, fontFamily: MONO, marginTop: 12 }}>
        {ctx.Class} · {ctx.Track} · {ctx.Session}
      </div>

      {/* placeholder telemetry grid */}
      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
        }}
      >
        {["Primary metric", "Delta vs. ideal", "Confidence", "Sample window"].map((m) => (
          <div
            key={m}
            style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO, letterSpacing: "0.06em" }}>
              {m.toUpperCase()}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.t2, marginTop: 8, fontFamily: MONO }}>
              — <span style={{ fontSize: 12, color: C.t3 }}>TBD</span>
            </div>
          </div>
        ))}
      </div>

      {/* admin-only completeness notice */}
      {isAdmin && (
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${C.amber}55`,
            background: `${C.amber}12`,
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.amber, letterSpacing: "0.06em" }}>
            ADMIN · DATA COMPLETENESS
          </div>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 6 }}>
            Telemetry fields pending MoTeC ingestion layer. Values render once the
            <code style={{ color: C.t1, fontFamily: MONO }}> .ld/.ldx</code> parser populates this agent's inputs.
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 22,
          padding: 18,
          border: `1px dashed ${C.line}`,
          borderRadius: 10,
          color: C.t3,
          fontSize: 13,
        }}
      >
        Synthesized output panel — the {a.n} agent's contribution to the unified
        engineer report appears here after a run.
      </div>
    </div>
  );
}

/* ============================================================
   TRACK NOTES READER — published corner dossiers (read-only)
   ============================================================ */
function TrackNotesReader({ ctx, isAdmin }) {
  const key = `${ctx.Track}|${ctx.Class}`;
  const guide = DOSSIERS[key];
  const [sel, setSel] = useState(0);

  if (!guide) {
    return (
      <div style={{ padding: 40, color: C.t2 }}>
        <Pill tone="grey">Read-only · ByteCraft</Pill>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: C.t1, marginTop: 16 }}>
          No published guide yet
        </h2>
        <div style={{ fontSize: 14, maxWidth: 480, lineHeight: 1.5 }}>
          There's no published track guide for {ctx.Track} in the {ctx.Class} class.
          Pick Circuit Zolder · LMGT3 to read a seeded dossier set.
        </div>
      </div>
    );
  }

  const corner = guide.corners[sel];
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* corner index */}
      <div style={{ width: 260, borderRight: `1px solid ${C.line}`, overflowY: "auto", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Pill>Read-only · ByteCraft</Pill>
        </div>
        <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO, marginBottom: 10 }}>
          {ctx.Track.toUpperCase()} · {ctx.Class}
          {isAdmin && (
            <span style={{ color: C.amber }}> · {guide.published}/{guide.total} PUBLISHED</span>
          )}
        </div>
        {Array.from({ length: guide.total }).map((_, i) => {
          const c = guide.corners[i];
          const live = !!c;
          return (
            <div
              key={i}
              onClick={() => live && setSel(i)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${sel === i && live ? C.pink : C.line}`,
                background: sel === i && live ? `${C.pink}12` : live ? C.panel : "transparent",
                marginBottom: 7,
                cursor: live ? "pointer" : "default",
                opacity: live ? 1 : 0.4,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>
                T{i + 1} {live ? c.name : ""}
              </span>
              {!live && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.t3 }}>
                  {isAdmin ? "SOON" : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* dossier */}
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        {/* Zone A — header */}
        <div style={{ borderLeft: `3px solid ${C.pink}`, paddingLeft: 14, marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.pink }}>CORNER T{corner.n}</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 900, color: C.t1, letterSpacing: "-0.02em" }}>
            {corner.name}
          </h2>
        </div>

        {/* Zone B — approach data */}
        <SectionLabel>Approach</SectionLabel>
        <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
          <DataTile label="Entry speed" value={`${corner.entry}`} unit="km/h" />
          <DataTile label="Gear" value={`${corner.gear}`} unit="" />
        </div>

        {/* Zone C — positioning */}
        <SectionLabel>Car positioning</SectionLabel>
        <div style={{ marginBottom: 22 }}>
          {[["Entry", corner.entryPos], ["Apex", corner.apexPos], ["Exit", corner.exitPos]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 14, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 56, fontFamily: MONO, fontSize: 11, color: C.pink, paddingTop: 2 }}>
                {k.toUpperCase()}
              </div>
              <div style={{ fontSize: 14, color: C.t1 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Zone D + tire quad */}
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <SectionLabel>Risks & notes</SectionLabel>
            {corner.risks.map(([label, desc], i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.amber }}>{label.toUpperCase()}</span>
                <div style={{ fontSize: 13, color: C.t2 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div>
            <SectionLabel>Tire load</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 64px)", gap: 8 }}>
              {["FL", "FR", "RL", "RR"].map((t) => {
                const v = corner.load[t];
                const col = v === "High" ? C.pink : v === "Med" ? C.amber : C.t3;
                return (
                  <div
                    key={t}
                    style={{
                      border: `1px solid ${col}66`,
                      background: `${col}14`,
                      borderRadius: 8,
                      padding: "10px 0",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.t3 }}>{t}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: col, marginTop: 3 }}>{v}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, fontSize: 11, color: C.t3, fontFamily: MONO, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          Telemetry-derived fields are authoritative and not user-editable.
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, color: C.t3, letterSpacing: "0.08em", marginBottom: 10 }}>
      {String(children).toUpperCase()}
    </div>
  );
}

function DataTile({ label, value, unit }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 18px", minWidth: 120 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.t3, letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </div>
      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: C.t1, fontFamily: MONO }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: C.t3, marginLeft: 5 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ============================================================
   PROGRESSION TRACKER — tier badges, gap-to-ideal, sparkline
   ============================================================ */
function Sparkline({ points, color }) {
  const w = 120, h = 30, pad = 2;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  // lower gap = better, so invert Y
  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = pad + ((p - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ProgressionTracker({ tierConfig, setTierConfig, isAdmin }) {
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState({ Track: "All", Class: "All", Session: "All" });

  const opts = (field) => ["All", ...Array.from(new Set(PROGRESSION.map((r) => r[field])))];
  const rows = PROGRESSION.filter(
    (r) =>
      (filters.Track === "All" || r.track === filters.Track) &&
      (filters.Class === "All" || r.cls === filters.Class) &&
      (filters.Session === "All" || r.session === filters.Session)
  );
  const FILTER_FIELDS = [
    ["Track", "track"],
    ["Class", "cls"],
    ["Session", "session"],
  ];
  return (
    <div style={{ padding: 26, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: C.t1, letterSpacing: "-0.02em" }}>
          Progression
        </h2>
        <button onClick={() => setEditing(!editing)} style={btn("ghost")}>
          {editing ? "Done" : "Configure tiers"}
        </button>
      </div>
      <div style={{ color: C.t2, fontSize: 14, marginBottom: 18 }}>
        Gap to the session ideal across every Simulator × Class × Track × Session you've run.
        Lower is better — closing the gap moves you up the tiers.
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 22, alignItems: "flex-end", flexWrap: "wrap" }}>
        {FILTER_FIELDS.map(([label, field]) => (
          <label key={label} style={{ display: "block" }}>
            <div style={{ fontSize: 10, color: C.t3, fontFamily: MONO, marginBottom: 4, letterSpacing: "0.08em" }}>
              {label.toUpperCase()}
            </div>
            <select
              value={filters[label]}
              onChange={(e) => setFilters({ ...filters, [label]: e.target.value })}
              style={{
                background: C.panel,
                color: filters[label] === "All" ? C.t2 : C.t1,
                border: `1px solid ${filters[label] === "All" ? C.line : C.pink}`,
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: FONT,
                minWidth: 150,
                cursor: "pointer",
              }}
            >
              {opts(field).map((o) => (
                <option key={o} value={o}>{o === "All" ? `All ${label.toLowerCase()}s` : o}</option>
              ))}
            </select>
          </label>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.t3, paddingBottom: 9 }}>
          {rows.length} of {PROGRESSION.length} shown
          {(filters.Track !== "All" || filters.Class !== "All" || filters.Session !== "All") && (
            <button
              onClick={() => setFilters({ Track: "All", Class: "All", Session: "All" })}
              style={{
                marginLeft: 12,
                background: "transparent",
                border: `1px solid ${C.line}`,
                color: C.t2,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                fontFamily: MONO,
                cursor: "pointer",
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* tier legend / config */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {tierConfig.map((t, i) => (
          <div
            key={t.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${t.color}55`,
              background: `${t.color}12`,
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 99, background: t.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{t.n}</span>
            {editing && t.max !== Infinity ? (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.t2 }}>
                ≤
                <input
                  type="number"
                  step="0.1"
                  value={t.max}
                  onChange={(e) => {
                    const next = [...tierConfig];
                    next[i] = { ...t, max: parseFloat(e.target.value) || 0 };
                    setTierConfig(next);
                  }}
                  style={{
                    width: 48,
                    marginLeft: 4,
                    background: C.ink,
                    color: C.t1,
                    border: `1px solid ${C.line}`,
                    borderRadius: 4,
                    padding: "2px 4px",
                    fontFamily: MONO,
                  }}
                />
                %
              </span>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.t3 }}>
                {t.max === Infinity ? "rest" : `≤${t.max}%`}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* rows */}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.length === 0 && (
          <div style={{ padding: 26, textAlign: "center", color: C.t3, border: `1px dashed ${C.line}`, borderRadius: 10, fontSize: 14 }}>
            No sessions match these filters. Clear a filter to see more.
          </div>
        )}
        {rows.map((r, i) => {
          const tier = tierFor(r.gap, tierConfig);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 0.8fr 140px 0.8fr",
                alignItems: "center",
                gap: 16,
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: "14px 18px",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{r.track}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.t3 }}>
                  {r.cls} · {r.session}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.t3 }}>GAP TO IDEAL</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: tier.color }}>
                  {r.gap.toFixed(2)}%
                </div>
              </div>
              <div
                style={{
                  justifySelf: "start",
                  fontSize: 12,
                  fontWeight: 700,
                  color: tier.color,
                  border: `1px solid ${tier.color}66`,
                  background: `${tier.color}14`,
                  borderRadius: 6,
                  padding: "4px 10px",
                }}
              >
                {tier.n}
              </div>
              <Sparkline points={r.trend} color={tier.color} />
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.green, justifySelf: "end" }}>
                ▼ improving
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 11, color: C.amber }}>
          ADMIN · Trend data is seeded for layout. Live values populate from User Session History after MoTeC ingestion.
        </div>
      )}
    </div>
  );
}

/* ---------- button factory ---------- */
function btn(kind) {
  const base = {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 700,
    padding: "9px 16px",
    borderRadius: 7,
    cursor: "pointer",
    border: "1px solid transparent",
    transition: "all .15s",
  };
  if (kind === "solid")
    return { ...base, background: C.pink, color: C.ink, boxShadow: `0 0 16px ${C.pink}44` };
  return { ...base, background: "transparent", color: C.t1, border: `1px solid ${C.line}` };
}

/* ============================================================
   ROOT
   ============================================================ */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const id = "dm-sans-font";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href =
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  return (
    <div
      style={{
        fontFamily: FONT,
        background: C.ink,
        color: C.t1,
        minHeight: "100vh",
      }}
    >
      {loggedIn ? (
        <AppShell
          onExit={() => setLoggedIn(false)}
          isAdmin={isAdmin}
          setIsAdmin={setIsAdmin}
        />
      ) : (
        <Landing onEnter={() => setLoggedIn(true)} />
      )}
    </div>
  );
}
