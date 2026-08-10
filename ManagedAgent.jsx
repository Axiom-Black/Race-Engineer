import { useState } from "react";

const API = "https://api.anthropic.com/v1/messages";

async function callClaude(system, user, maxTokens = 800) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text;
}

const STATUS_COLOR = {
  idle: "#333",
  running: "#FF8710",
  done: "#12BB1E",
  error: "#FF4444",
};

const STATUS_LABEL = {
  idle: "STANDBY",
  running: "RUNNING",
  done: "DONE",
  error: "ERROR",
};

function StatusPip({ status }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: STATUS_COLOR[status] || "#333",
        boxShadow:
          status === "running" ? `0 0 10px ${STATUS_COLOR.running}` : "none",
        animation: status === "running" ? "pip 1.1s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    />
  );
}

function AgentCard({ id, label, description, task, firstLine, status }) {
  return (
    <div
      style={{
        background: "#080808",
        border: `1px solid ${
          status === "done"
            ? "#FF871055"
            : status === "running"
            ? "#FF871033"
            : "#1c1c1c"
        }`,
        borderRadius: 10,
        padding: "16px",
        transition: "border-color 0.4s ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusPip status={status} />
          <span
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#fff" }}
          >
            {label}
          </span>
        </div>
        <span
          style={{
            fontSize: 8,
            color: status === "done" ? "#FF8710" : "#444",
            letterSpacing: 1.5,
            fontWeight: 700,
          }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div style={{ fontSize: 10, color: "#444", lineHeight: 1.5 }}>
        {task ? `${task.substring(0, 90)}…` : description}
      </div>

      {firstLine && (
        <div
          style={{
            borderTop: "1px solid #1a1a1a",
            paddingTop: 8,
            fontSize: 10,
            color: "#777",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          {firstLine}
        </div>
      )}
    </div>
  );
}

function Connector({ visible }) {
  if (!visible) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
      <div
        style={{
          width: 1,
          height: 20,
          background: "linear-gradient(to bottom, #FF871066, #FF871022)",
        }}
      />
    </div>
  );
}

export default function ManagedAgent() {
  const [track, setTrack] = useState("Circuit de la Sarthe");
  const [corner, setCorner] = useState("Ford Chicane (Turns 1–2)");
  const [notes, setNotes] = useState("");

  const [phase, setPhase] = useState("idle");
  const [orchStatus, setOrchStatus] = useState("idle");
  const [synthStatus, setSynthStatus] = useState("idle");
  const [tasks, setTasks] = useState(null);
  const [agentStatuses, setAgentStatuses] = useState({
    speed: "idle",
    position: "idle",
    risk: "idle",
  });
  const [agentOutputs, setAgentOutputs] = useState({
    speed: null,
    position: null,
    risk: null,
  });
  const [dossier, setDossier] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setPhase("running");
    setOrchStatus("running");
    setSynthStatus("idle");
    setTasks(null);
    setAgentStatuses({ speed: "idle", position: "idle", risk: "idle" });
    setAgentOutputs({ speed: null, position: null, risk: null });
    setDossier(null);
    setError(null);

    try {
      // ── ORCHESTRATOR ──────────────────────────────────────────────
      const rawOrch = await callClaude(
        `You are the orchestrator of a LeMans Ultimate (LMU) corner analysis multi-agent system.
Break the user's corner analysis task into 3 targeted subtasks for these specialist agents:
1. Speed & Gear Analyst – entry speed, braking markers, gear selection
2. Line & Position Analyst – car placement at entry, apex, exit
3. Risk & Load Analyst – hazards, tire/vehicle load, stability risks

Return ONLY valid JSON, no markdown backticks, exactly this shape:
{"speed":"…","position":"…","risk":"…","summary":"one sentence describing this corner's key challenge"}`,
        `Track: ${track}\nCorner: ${corner}\nContext: ${notes || "none"}`
      );

      let parsed;
      try {
        parsed = JSON.parse(rawOrch);
      } catch {
        parsed = JSON.parse(rawOrch.replace(/```json|```/g, "").trim());
      }

      setTasks(parsed);
      setOrchStatus("done");
      setAgentStatuses({ speed: "running", position: "running", risk: "running" });

      // ── SUBAGENTS (parallel) ──────────────────────────────────────
      const outputs = {};

      await Promise.all([
        (async () => {
          try {
            outputs.speed = await callClaude(
              `You are a Speed & Gear Analyst for LMU racing. 
Produce exactly 4 bullet points with specific data (speeds in km/h, gear numbers 1–8).
Each bullet starts with "• " and a bold label like "**Entry Speed:**".`,
              `Track: ${track}\nCorner: ${corner}\nTask: ${parsed.speed}`
            );
            setAgentStatuses((p) => ({ ...p, speed: "done" }));
            setAgentOutputs((p) => ({ ...p, speed: outputs.speed }));
          } catch {
            outputs.speed = "• Data unavailable.";
            setAgentStatuses((p) => ({ ...p, speed: "error" }));
          }
        })(),
        (async () => {
          try {
            outputs.position = await callClaude(
              `You are a Line & Position Analyst for LMU racing.
Produce exactly 4 bullet points describing car placement (use terms like "left kerb", "late apex", "clip").
Each bullet starts with "• " and a bold label like "**Entry Line:**".`,
              `Track: ${track}\nCorner: ${corner}\nTask: ${parsed.position}`
            );
            setAgentStatuses((p) => ({ ...p, position: "done" }));
            setAgentOutputs((p) => ({ ...p, position: outputs.position }));
          } catch {
            outputs.position = "• Data unavailable.";
            setAgentStatuses((p) => ({ ...p, position: "error" }));
          }
        })(),
        (async () => {
          try {
            outputs.risk = await callClaude(
              `You are a Risk & Load Analyst for LMU racing.
Produce exactly 4 bullet points on hazards, tire load events, and vehicle stability.
Each bullet starts with "• " and a bold label like "**Understeer Risk:**".`,
              `Track: ${track}\nCorner: ${corner}\nTask: ${parsed.risk}`
            );
            setAgentStatuses((p) => ({ ...p, risk: "done" }));
            setAgentOutputs((p) => ({ ...p, risk: outputs.risk }));
          } catch {
            outputs.risk = "• Data unavailable.";
            setAgentStatuses((p) => ({ ...p, risk: "error" }));
          }
        })(),
      ]);

      // ── SYNTHESIZER ───────────────────────────────────────────────
      setSynthStatus("running");

      const raw = await callClaude(
        `You are a race engineer compiling the final corner dossier for a LMU driver briefing.
Synthesize the 3 specialist reports into a clean, structured guide.
Use EXACTLY these section headers (with ## prefix) and no other headers:
## OVERVIEW
## APPROACH
## APEX
## EXIT
## RISKS & NOTES
Keep each section to 2–3 sentences. Be specific and actionable.`,
        `Corner: ${corner}\nTrack: ${track}\n\nSpeed & Gear:\n${outputs.speed}\n\nLine & Position:\n${outputs.position}\n\nRisk & Load:\n${outputs.risk}`,
        1000
      );

      setDossier(raw);
      setSynthStatus("done");
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("error");
      setOrchStatus((s) => (s === "running" ? "error" : s));
    }
  };

  const subAgents = [
    {
      id: "speed",
      label: "SPEED & GEAR",
      description: "Entry speed · Braking markers · Gear selection",
    },
    {
      id: "position",
      label: "LINE & POSITION",
      description: "Entry line · Apex placement · Exit trajectory",
    },
    {
      id: "risk",
      label: "RISK & LOAD",
      description: "Hazards · Tire load events · Vehicle stability",
    },
  ];

  const renderDossier = (text) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return (
          <div
            key={i}
            style={{
              color: "#FF8710",
              fontSize: 9,
              letterSpacing: 2.5,
              fontWeight: 700,
              marginTop: 20,
              marginBottom: 6,
            }}
          >
            {line.replace("## ", "")}
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} style={{ height: 4 }} />;
      return (
        <div
          key={i}
          style={{ color: "#bbb", fontSize: 13, lineHeight: 1.65, marginBottom: 1 }}
        >
          {line}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        backgroundColor: "#000",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700;9..40,900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pip { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        input,textarea { font-family: 'DM Sans', sans-serif; outline: none; transition: border-color .2s; }
        input:focus, textarea:focus { border-color: #FF8710 !important; }
        .run-btn { font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all .2s ease; }
        .run-btn:hover:not(:disabled) { background: #FF8710 !important; color: #000 !important; }
        .run-btn:disabled { opacity: .4; cursor: not-allowed; }
        .fade-in { animation: fadeUp .4s ease forwards; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #222; }
      `}</style>

      {/* ── HEADER ── */}
      <div
        style={{
          borderBottom: "1px solid #111",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            background: "#FF8710",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 12,
            color: "#000",
            letterSpacing: 0.5,
          }}
        >
          AB
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
            AXIOM BLACK
          </div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 0.5 }}>
            Race Session Manager · Managed Agent Demo
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {[
            ["ENGINEERING", "#0049ED"],
            ["TECHNOLOGY", "#FF8710"],
            ["CONSULTING", "#12BB1E"],
          ].map(([t, c]) => (
            <span key={t} style={{ fontSize: 8, color: c, fontWeight: 700, letterSpacing: 1.5 }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 24px" }}>
        {/* ── PAGE TITLE ── */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 9,
              color: "#FF8710",
              letterSpacing: 2.5,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            MULTI-AGENT ORCHESTRATION
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
            Corner Analysis Agent
          </h1>
          <p style={{ color: "#555", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
            An orchestrator decomposes your corner request into three parallel specialist
            agents, then a synthesizer assembles their outputs into a driver-ready dossier.
          </p>
        </div>

        {/* ── INPUT PANEL ── */}
        <div
          style={{
            background: "#080808",
            border: "1px solid #1a1a1a",
            borderRadius: 12,
            padding: 24,
            marginBottom: 28,
          }}
        >
          <div
            style={{ fontSize: 9, color: "#FF8710", letterSpacing: 2.5, fontWeight: 700, marginBottom: 18 }}
          >
            TASK INPUT
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}
          >
            {[
              ["TRACK", track, setTrack],
              ["CORNER", corner, setCorner],
            ].map(([label, val, setter]) => (
              <div key={label}>
                <label
                  style={{ fontSize: 9, color: "#555", display: "block", marginBottom: 6, letterSpacing: 1.5 }}
                >
                  {label}
                </label>
                <input
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0e0e0e",
                    border: "1px solid #222",
                    borderRadius: 7,
                    padding: "10px 13px",
                    color: "#fff",
                    fontSize: 13,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{ fontSize: 9, color: "#555", display: "block", marginBottom: 6, letterSpacing: 1.5 }}
            >
              ADDITIONAL CONTEXT
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. wet conditions, GTE car class, focus on brake stability..."
              rows={2}
              style={{
                width: "100%",
                background: "#0e0e0e",
                border: "1px solid #222",
                borderRadius: 7,
                padding: "10px 13px",
                color: "#fff",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </div>
          <button
            onClick={run}
            disabled={phase === "running"}
            className="run-btn"
            style={{
              background: "transparent",
              border: "1px solid #FF8710",
              color: "#FF8710",
              borderRadius: 7,
              padding: "10px 26px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {phase === "running" ? "ANALYZING…" : "RUN AGENT ↗"}
          </button>
        </div>

        {/* ── AGENT FLOW ── */}
        {phase !== "idle" && (
          <div className="fade-in" style={{ marginBottom: 28 }}>
            {/* ORCHESTRATOR NODE */}
            <div
              style={{
                background: "#080808",
                border: `1px solid ${
                  orchStatus === "done" ? "#FF871055" : orchStatus === "running" ? "#FF871033" : "#1c1c1c"
                }`,
                borderRadius: 10,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "border-color .4s",
              }}
            >
              <StatusPip status={orchStatus} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
                  ORCHESTRATOR
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                  {tasks?.summary ||
                    (orchStatus === "running"
                      ? "Decomposing task into specialist subtasks…"
                      : "Awaiting task")}
                </div>
              </div>
              <span
                style={{
                  fontSize: 8,
                  color: orchStatus === "done" ? "#FF8710" : "#333",
                  letterSpacing: 1.5,
                  fontWeight: 700,
                }}
              >
                {STATUS_LABEL[orchStatus]}
              </span>
            </div>

            <Connector visible={!!tasks} />

            {/* SUBAGENT CARDS */}
            {tasks && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {subAgents.map((a) => (
                  <AgentCard
                    key={a.id}
                    id={a.id}
                    label={a.label}
                    description={a.description}
                    task={tasks[a.id]}
                    firstLine={
                      agentOutputs[a.id]
                        ? agentOutputs[a.id].split("\n").find((l) => l.trim())
                        : null
                    }
                    status={agentStatuses[a.id]}
                  />
                ))}
              </div>
            )}

            <Connector visible={synthStatus !== "idle"} />

            {/* SYNTHESIZER NODE */}
            {synthStatus !== "idle" && (
              <div
                style={{
                  background: "#080808",
                  border: `1px solid ${
                    synthStatus === "done"
                      ? "#FF871055"
                      : synthStatus === "running"
                      ? "#FF871033"
                      : "#1c1c1c"
                  }`,
                  borderRadius: 10,
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: "border-color .4s",
                }}
              >
                <StatusPip status={synthStatus} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
                    SYNTHESIZER
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                    {synthStatus === "running"
                      ? "Compiling final corner dossier…"
                      : "Corner dossier compiled"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 8,
                    color: synthStatus === "done" ? "#FF8710" : "#333",
                    letterSpacing: 1.5,
                    fontWeight: 700,
                  }}
                >
                  {STATUS_LABEL[synthStatus]}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── DOSSIER OUTPUT ── */}
        {dossier && (
          <div
            className="fade-in"
            style={{
              background: "#080808",
              border: "1px solid #FF871022",
              borderRadius: 12,
              padding: 28,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#FF8710",
                letterSpacing: 2.5,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              CORNER DOSSIER
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 2 }}>{corner}</div>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 24 }}>{track}</div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 20 }}>
              {renderDossier(dossier)}
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {error && (
          <div
            style={{
              background: "#0f0000",
              border: "1px solid #FF444433",
              borderRadius: 10,
              padding: "16px 20px",
              color: "#FF7777",
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
