import { useState } from "react";

const API = "https://api.anthropic.com/v1/messages";

async function callClaude(system, user, maxTokens = 700) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

// ── ByteCraft Racing palette ──────────────────────────────────────
const C = {
  bg: "#0A0A0C",
  panel: "#101013",
  panel2: "#15151A",
  line: "#222228",
  pink: "#FF2D78",
  pinkDim: "#FF2D7833",
  silver1: "#6E7278",
  silver2: "#B0B5BB",
  silver3: "#E8EAED",
  text: "#D6D8DC",
  textDim: "#6E7278",
};

const STATUS_COLOR = {
  idle: "#3A3A42",
  queued: "#6E7278",
  running: C.pink,
  done: C.silver2,
  skip: "#2A2A30",
  error: "#FF5555",
};

const LIBS = [
  { id: "track", name: "Track Notes", sub: "Per class · per sim", default: 45 },
  { id: "ideal", name: "Ideal Session Data", sub: "Managed reference library", default: 60 },
  { id: "user", name: "User Session History", sub: "Your historical landscape", default: 25 },
  { id: "dynamics", name: "Vehicle Dynamics", sub: "Theoretical frameworks", default: 80 },
];

const DOMAIN_AGENTS = {
  aero: {
    label: "AERODYNAMICS",
    scope: "Wing & ride-height settings, aero efficiency, downforce/drag trade-off per class & track",
    system:
      "You are the Aerodynamics Agent in a sim-racing Race Engineering system. Report on wing/ride-height settings, aero efficiency, and the downforce-vs-drag trade-off for THIS car class and track. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
  tire: {
    label: "TIRE",
    scope: "Compound selection, wear rate, tire & brake temps, wheel speed, slip behaviour",
    system:
      "You are the Tire Agent in a sim-racing Race Engineering system. Report on compound selection, wear rate, tire and brake temperatures, and slip behaviour. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
  powertrain: {
    label: "POWERTRAIN",
    scope: "Fuel setting, hybrid/electric deploy & harvest, influence on lap performance",
    system:
      "You are the Powertrain Agent in a sim-racing Race Engineering system. Report on fuel mixture settings, hybrid/electric deployment & harvest strategy, and their influence on lap performance. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
  telemetry: {
    label: "TELEMETRY",
    scope: "Track layout, braking, long/lat/vert accel, speed, wheel rotation, interactions",
    system:
      "You are the Telemetry Agent in a sim-racing Race Engineering system. Report on braking points, longitudinal/lateral acceleration traces, speed and wheel-rotation patterns, and how these interact across the lap. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
  strategy: {
    label: "STRATEGY",
    scope: "Run plans, qualifying targets, race strategy & session targets vs user baseline",
    system:
      "You are the Strategy Agent in a sim-racing Race Engineering system. Build session run-plans, lap-time targets and stint/strategy guidance for the given session type, calibrated against the user's baseline. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
  environment: {
    label: "ENVIRONMENT",
    scope: "Weather, time of day, track condition and their influence on performance",
    system:
      "You are the Environment Agent in a sim-racing Race Engineering system. Report on how weather, time of day and track condition (rubber, temp, grip) influence performance and setup direction. Return exactly 3 findings, each on its own line starting with '• ' and a short bold '**label:**'. Be specific and concise.",
  },
};

const MODES = [
  { id: "brief", label: "PRE-SESSION BRIEF", desc: "Prepare run plan & setup direction before track time" },
  { id: "debrief", label: "SESSION DEBRIEF", desc: "Analyse a completed session & surface where to improve" },
  { id: "monitor", label: "AUTONOMOUS MONITOR", desc: "Scan recent history for issues you may have overlooked" },
];

// ── small UI atoms ────────────────────────────────────────────────
function Pip({ status }) {
  const running = status === "running";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: STATUS_COLOR[status] || C.line,
        boxShadow: running ? `0 0 9px ${C.pink}` : "none",
        animation: running ? "pip 1.1s ease-in-out infinite" : "none",
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

function NodeShell({ status, children, accent }) {
  const border =
    status === "running"
      ? C.pinkDim
      : status === "done"
      ? "#33333A"
      : status === "skip"
      ? "#1A1A1E"
      : C.line;
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${accent ? C.pinkDim : border}`,
        borderRadius: 10,
        padding: "13px 16px",
        transition: "border-color .4s",
        opacity: status === "skip" ? 0.4 : 1,
      }}
    >
      {children}
    </div>
  );
}

function Connector({ on }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", height: 16 }}>
      {on && (
        <div
          style={{
            width: 1,
            height: "100%",
            background: `linear-gradient(${C.pink}66, ${C.pink}11)`,
          }}
        />
      )}
    </div>
  );
}

function Label({ children, color = C.pink, mt = 0 }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 2.5,
        fontWeight: 700,
        color,
        marginTop: mt,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

export default function RaceEngineeringAgent() {
  const [mode, setMode] = useState("brief");
  const [sim] = useState("LeMans Ultimate");
  const [carClass, setCarClass] = useState("GTE — Ferrari 488 GTE Evo");
  const [track, setTrack] = useState("Circuit de la Sarthe");
  const [session, setSession] = useState("Qualifying");
  const [notes, setNotes] = useState("");
  const [maturity, setMaturity] = useState(
    Object.fromEntries(LIBS.map((l) => [l.id, l.default]))
  );

  const [phase, setPhase] = useState("idle");
  const [userStatus, setUserStatus] = useState("idle");
  const [engineerStatus, setEngineerStatus] = useState("idle");
  const [plan, setPlan] = useState(null);
  const [agentStatus, setAgentStatus] = useState({});
  const [agentOut, setAgentOut] = useState({});
  const [optStatus, setOptStatus] = useState("idle");
  const [kpis, setKpis] = useState(null);
  const [synthStatus, setSynthStatus] = useState("idle");
  const [guidance, setGuidance] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => {
    setUserStatus("idle");
    setEngineerStatus("idle");
    setPlan(null);
    setAgentStatus({});
    setAgentOut({});
    setOptStatus("idle");
    setKpis(null);
    setSynthStatus("idle");
    setGuidance(null);
    setError(null);
  };

  const ctx = () =>
    `Simulator: ${sim}\nCar class: ${carClass}\nTrack: ${track}\nSession: ${session}\nMode: ${
      MODES.find((m) => m.id === mode).label
    }\nDriver notes: ${notes || "none provided"}`;

  const matLine = () =>
    LIBS.map((l) => `${l.name}: ${maturity[l.id]}% populated`).join("; ");

  const run = async () => {
    setPhase("running");
    reset();

    try {
      // 1 ── USER AGENT (intake + routing) ──────────────────────────
      setUserStatus("running");
      await new Promise((r) => setTimeout(r, 400));
      setUserStatus("done");

      // 2 ── RACE ENGINEER (orchestrator) ──────────────────────────
      setEngineerStatus("running");
      const rawPlan = await callClaude(
        `You are the Race Engineer Agent — the orchestrator of a sim-racing multi-agent system for ByteCraft Racing.
Given the session context, decide which domain specialist agents are RELEVANT to engage, and write a one-line task for each.
Available agents: aero, tire, powertrain, telemetry, strategy, environment.
Engage only the relevant ones (always include at least telemetry and one other; usually 3-5).
Return ONLY valid JSON, no markdown:
{"summary":"one line on the session's key engineering focus","agents":{"<id>":"<task>", ...}}`,
        ctx()
      );
      const parsed = parseJSON(rawPlan);
      const selected = Object.keys(parsed.agents).filter((id) => DOMAIN_AGENTS[id]);
      setPlan({ summary: parsed.summary, agents: parsed.agents, selected });
      setEngineerStatus("done");

      const initStatus = {};
      Object.keys(DOMAIN_AGENTS).forEach((id) => {
        initStatus[id] = selected.includes(id) ? "running" : "skip";
      });
      setAgentStatus(initStatus);

      // 3 ── DOMAIN AGENTS (parallel, only selected) ────────────────
      const outputs = {};
      await Promise.all(
        selected.map(async (id) => {
          try {
            const out = await callClaude(
              DOMAIN_AGENTS[id].system,
              `${ctx()}\n\nYour assigned task: ${parsed.agents[id]}\nLibrary maturity: ${matLine()}`
            );
            outputs[id] = out;
            setAgentOut((p) => ({ ...p, [id]: out }));
            setAgentStatus((p) => ({ ...p, [id]: "done" }));
          } catch {
            outputs[id] = "• Data unavailable for this agent.";
            setAgentStatus((p) => ({ ...p, [id]: "error" }));
          }
        })
      );

      const reports = selected
        .map((id) => `### ${DOMAIN_AGENTS[id].label}\n${outputs[id]}`)
        .join("\n\n");

      // 4 ── OPTIMIZER (KPIs) ───────────────────────────────────────
      setOptStatus("running");
      const rawKpi = await callClaude(
        `You are the Optimizer Agent in a sim-racing Race Engineering system.
From the specialist reports, derive 4 performance KPIs that give insight into vehicle behaviour.
Return ONLY valid JSON array, no markdown:
[{"name":"short KPI name","value":"number or range","unit":"unit or empty","status":"good|watch|risk","note":"under 8 word insight"}]`,
        `${ctx()}\n\nSpecialist reports:\n${reports}`,
        600
      );
      const kpiData = parseJSON(rawKpi);
      setKpis(kpiData);
      setOptStatus("done");

      // 5 ── SYNTHESIZER (guidance + trade-offs) ───────────────────
      setSynthStatus("running");
      const synth = await callClaude(
        `You are the Synthesizer Agent for ByteCraft Racing — you guide the driver in understanding the utility and TRADE-OFFS of each setup/technique decision.
Compile the specialist reports into clear driver guidance for the current mode.
Use EXACTLY these ## headers and no others:
## HEADLINE  (one sharp sentence)
## DO THIS  (2-3 prioritised, concrete actions)
## TRADE-OFFS  (2 lines: what each action costs)
## CONFIDENCE  (one line referencing how library maturity affects trust in this guidance)
Keep it tight and actionable.`,
        `${ctx()}\n\nLibrary maturity: ${matLine()}\n\nSpecialist reports:\n${reports}`,
        900
      );
      setGuidance(synth);
      setSynthStatus("done");
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  };

  const renderGuidance = (text) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return (
          <div key={i} style={{ marginTop: i === 0 ? 0 : 18, marginBottom: 6 }}>
            <Label>{line.replace("## ", "")}</Label>
          </div>
        );
      }
      if (!line.trim()) return <div key={i} style={{ height: 3 }} />;
      const html = line.replace(/\*\*(.+?)\*\*/g, `<b style="color:${C.silver3}">$1</b>`);
      return (
        <div
          key={i}
          style={{ color: C.text, fontSize: 13, lineHeight: 1.62, marginBottom: 2 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });

  const renderBullets = (text) =>
    text
      .split("\n")
      .filter((l) => l.trim())
      .map((line, i) => {
        const html = line
          .replace(/^•\s*/, "")
          .replace(/\*\*(.+?)\*\*/g, `<b style="color:${C.silver2}">$1</b>`);
        return (
          <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5 }}>
            <span style={{ color: C.pink, fontSize: 11, lineHeight: 1.5 }}>▸</span>
            <span
              style={{ color: C.text, fontSize: 11.5, lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      });

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        background: C.bg,
        minHeight: "100vh",
        color: C.text,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700;9..40,900&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pip { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(1.5)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .fade { animation: fadeUp .4s ease forwards; }
        input,textarea,select { font-family:'DM Sans',sans-serif; outline:none; transition:border-color .2s; }
        input:focus,textarea:focus,select:focus { border-color:${C.pink}!important; }
        .mono { font-family:'JetBrains Mono',monospace; }
        .btn { cursor:pointer; transition:all .2s; }
        .btn:hover:not(:disabled){ background:${C.pink}!important; color:#fff!important; border-color:${C.pink}!important; }
        .btn:disabled{ opacity:.4; cursor:not-allowed; }
        .modebtn:hover{ border-color:${C.silver1}!important; }
        input[type=range]{ -webkit-appearance:none; height:3px; background:${C.line}; border-radius:2px; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:${C.pink}; cursor:pointer; }
        ::-webkit-scrollbar{ width:4px } ::-webkit-scrollbar-thumb{ background:#26262c }
      `}</style>

      {/* ── HEADER ── */}
      <div
        style={{
          borderBottom: `1px solid ${C.line}`,
          padding: "14px 26px",
          display: "flex",
          alignItems: "center",
          gap: 13,
        }}
      >
        <svg width="30" height="30" viewBox="0 0 30 30">
          <rect x="3" y="3" width="24" height="24" rx="5" fill="none" stroke={C.pink} strokeWidth="2" />
          <path
            d="M10 9 L10 21 M10 9 L17 9 Q21 9 21 13 Q21 15 18 15 L10 15 M18 15 Q22 15 22 19 Q22 21 18 21 L10 21"
            fill="none"
            stroke={C.silver3}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>
            BYTECRAFT <span style={{ color: C.pink }}>RACING</span>
          </div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5 }}>
            Race Engineering Agent
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            textAlign: "right",
            fontSize: 8.5,
            color: C.textDim,
            lineHeight: 1.6,
            letterSpacing: 0.4,
          }}
        >
          DATA ENGINEERING · THE BYTECRAFT COMPANY
          <br />
          PLATFORM · AXIOM BLACK LLC
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 26px 60px" }}>
        {/* ── LIBRARY STATUS ── */}
        <Label>KNOWLEDGE LIBRARIES</Label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 10,
            margin: "10px 0 10px",
          }}
        >
          {LIBS.map((l) => (
            <div
              key={l.id}
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 9,
                padding: "12px 13px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: C.silver3 }}>{l.name}</div>
              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 9 }}>{l.sub}</div>
              <div
                style={{
                  height: 3,
                  background: C.line,
                  borderRadius: 2,
                  overflow: "hidden",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: `${maturity[l.id]}%`,
                    height: "100%",
                    background: C.pink,
                    transition: "width .3s",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 9, color: C.silver2 }}>
                  {maturity[l.id]}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={maturity[l.id]}
                  onChange={(e) => setMaturity((p) => ({ ...p, [l.id]: Number(e.target.value) }))}
                  style={{ width: 60 }}
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: C.textDim, marginBottom: 28, fontStyle: "italic" }}>
          Library maturity is fed to the agents — guidance confidence grows as your data accumulates.
        </div>

        {/* ── MODE SELECT ── */}
        <Label>OPERATING MODE</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, margin: "10px 0 24px" }}>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <div
                key={m.id}
                className="modebtn"
                onClick={() => setMode(m.id)}
                style={{
                  cursor: "pointer",
                  background: active ? C.panel2 : C.panel,
                  border: `1px solid ${active ? C.pink : C.line}`,
                  borderRadius: 9,
                  padding: "13px 14px",
                  transition: "all .2s",
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 700, color: active ? C.pink : C.silver2, letterSpacing: 1 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4, lineHeight: 1.4 }}>{m.desc}</div>
              </div>
            );
          })}
        </div>

        {/* ── SESSION INPUT ── */}
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: 11,
            padding: 22,
            marginBottom: 26,
          }}
        >
          <Label>SESSION CONTEXT</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, margin: "14px 0 13px" }}>
            {[
              ["SIMULATOR", sim, null, true],
              ["CAR CLASS", carClass, setCarClass],
              ["TRACK", track, setTrack],
            ].map(([lab, val, setter, ro]) => (
              <div key={lab}>
                <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1.5, marginBottom: 6 }}>{lab}</div>
                <input
                  value={val}
                  readOnly={ro}
                  onChange={setter ? (e) => setter(e.target.value) : undefined}
                  style={{
                    width: "100%",
                    background: ro ? "#0c0c0f" : C.panel2,
                    border: `1px solid ${C.line}`,
                    borderRadius: 7,
                    padding: "9px 12px",
                    color: ro ? C.textDim : C.silver3,
                    fontSize: 12.5,
                  }}
                />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1.5, marginBottom: 6 }}>SESSION TYPE</div>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value)}
                style={{
                  width: "100%",
                  background: C.panel2,
                  border: `1px solid ${C.line}`,
                  borderRadius: 7,
                  padding: "9px 12px",
                  color: C.silver3,
                  fontSize: 12.5,
                }}
              >
                {["Testing", "Practice", "Qualifying", "Race"].map((s) => (
                  <option key={s} style={{ background: C.panel }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1.5, marginBottom: 6 }}>
              DRIVER NOTES → USER AGENT
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. car snaps on entry to the Mulsanne chicanes, rears overheating after 4 laps, losing time on traction out of slow corners..."
              style={{
                width: "100%",
                background: C.panel2,
                border: `1px solid ${C.line}`,
                borderRadius: 7,
                padding: "10px 12px",
                color: C.silver3,
                fontSize: 12.5,
                resize: "vertical",
              }}
            />
          </div>
          <button
            onClick={run}
            disabled={phase === "running"}
            className="btn"
            style={{
              background: "transparent",
              border: `1px solid ${C.pink}`,
              color: C.pink,
              borderRadius: 7,
              padding: "10px 28px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {phase === "running" ? "ENGINEERING…" : "ENGAGE RACE ENGINEER ↗"}
          </button>
        </div>

        {/* ── AGENT FLOW ── */}
        {phase !== "idle" && (
          <div className="fade" style={{ marginBottom: 26 }}>
            {/* USER AGENT */}
            <NodeShell status={userStatus}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pip status={userStatus} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: C.silver3 }}>
                    USER AGENT
                  </div>
                  <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 2 }}>
                    Captures session notes & routes to the relevant specialists
                  </div>
                </div>
              </div>
            </NodeShell>

            <Connector on={userStatus === "done"} />

            {/* RACE ENGINEER */}
            <NodeShell status={engineerStatus} accent>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pip status={engineerStatus} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: C.pink }}>
                    RACE ENGINEER · ORCHESTRATOR
                  </div>
                  <div style={{ fontSize: 11, color: C.text, marginTop: 3 }}>
                    {plan?.summary ||
                      (engineerStatus === "running"
                        ? "Selecting relevant specialist agents…"
                        : "Awaiting intake")}
                  </div>
                </div>
              </div>
            </NodeShell>

            <Connector on={!!plan} />

            {/* DOMAIN AGENTS */}
            {plan && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {Object.entries(DOMAIN_AGENTS).map(([id, a]) => {
                  const st = agentStatus[id] || "idle";
                  const engaged = st !== "skip";
                  return (
                    <NodeShell key={id} status={st}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Pip status={st} />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 1.3,
                            color: engaged ? C.silver3 : C.textDim,
                          }}
                        >
                          {a.label}
                        </span>
                        {!engaged && (
                          <span style={{ fontSize: 7.5, color: C.textDim, marginLeft: "auto", letterSpacing: 1 }}>
                            NOT ENGAGED
                          </span>
                        )}
                      </div>
                      {engaged ? (
                        agentOut[id] ? (
                          renderBullets(agentOut[id])
                        ) : (
                          <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
                            {plan.agents[id] ? `${plan.agents[id].slice(0, 70)}…` : "Working…"}
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: 9.5, color: "#3A3A42", lineHeight: 1.5 }}>{a.scope}</div>
                      )}
                    </NodeShell>
                  );
                })}
              </div>
            )}

            <Connector on={optStatus !== "idle"} />

            {/* OPTIMIZER */}
            {optStatus !== "idle" && (
              <NodeShell status={optStatus}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: kpis ? 12 : 0 }}>
                  <Pip status={optStatus} />
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: C.silver3 }}>
                    OPTIMIZER · KPI SYNTHESIS
                  </div>
                </div>
                {kpis && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
                    {kpis.map((k, i) => {
                      const col = k.status === "good" ? C.silver2 : k.status === "risk" ? "#FF5555" : C.pink;
                      return (
                        <div
                          key={i}
                          style={{
                            background: C.panel2,
                            border: `1px solid ${C.line}`,
                            borderRadius: 8,
                            padding: "10px 11px",
                          }}
                        >
                          <div style={{ fontSize: 8.5, color: C.textDim, letterSpacing: 1, textTransform: "uppercase" }}>
                            {k.name}
                          </div>
                          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: col, margin: "3px 0 2px" }}>
                            {k.value}
                            <span style={{ fontSize: 9, color: C.textDim, marginLeft: 3 }}>{k.unit}</span>
                          </div>
                          <div style={{ fontSize: 8.5, color: C.textDim, lineHeight: 1.3 }}>{k.note}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </NodeShell>
            )}

            <Connector on={synthStatus !== "idle"} />

            {/* SYNTHESIZER */}
            {synthStatus !== "idle" && (
              <NodeShell status={synthStatus}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Pip status={synthStatus} />
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: C.silver3 }}>
                    SYNTHESIZER · DRIVER GUIDANCE
                  </div>
                </div>
              </NodeShell>
            )}
          </div>
        )}

        {/* ── DATA DISPLAY OUTPUT ── */}
        {guidance && (
          <div
            className="fade"
            style={{
              background: C.panel,
              border: `1px solid ${C.pinkDim}`,
              borderRadius: 12,
              padding: 26,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
              <div>
                <Label>DATA DISPLAY · ENGINEERING BRIEF</Label>
                <div style={{ fontSize: 19, fontWeight: 900, color: C.silver3, marginTop: 4 }}>{track}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>
                  {carClass} · {session} · {MODES.find((m) => m.id === mode).label}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 9, color: C.textDim }}>
                {sim}
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>{renderGuidance(guidance)}</div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#160005",
              border: "1px solid #FF555533",
              borderRadius: 10,
              padding: "15px 18px",
              color: "#FF8888",
              fontSize: 12,
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>
    </div>
  );
}
