import { useState, useRef, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════
// ByteCraft Racing — Session Upload & Telemetry Viewer
// Parses real MoTeC .ld (binary) + .ldx (XML) + .svm (setup) IN-BROWSER,
// using JS ports of the backend parsers. Drop the three files and watch
// them decode. No backend required for this view.
// ══════════════════════════════════════════════════════════════════

const C = {
  bg:"#0A0A0C", panel:"#101013", panel2:"#15151A", line:"#222228",
  pink:"#FF2D78", pinkDim:"#FF2D7833", pinkBg:"rgba(255,45,120,0.09)", pinkBd:"rgba(255,45,120,0.25)",
  orange:"#FF8710", oBg:"rgba(255,135,16,0.09)", oBd:"rgba(255,135,16,0.25)",
  silver1:"#6E7278", silver2:"#B0B5BB", silver3:"#E8EAED",
  text:"#D6D8DC", dim:"#6E7278",
  good:"#5BD6A0", gold:"#E8C24A", risk:"#FF5555",
  blue:"#4FA3FF",
};

// ── Channel → agent-domain classification ─────────────────────────
function domainOf(name) {
  const n = name.toLowerCase();
  if (/tyre temp|tyre pressure|tyre load|tyre wear|grip fract|wheel rot/.test(n)) return "Tire";
  if (/brake temp|brake bias/.test(n)) return "Brakes";
  if (/ride height/.test(n)) return "Aero";
  if (/fuel|battery|water temp|oil temp/.test(n)) return "Powertrain";
  if (/ambient|track temp/.test(n)) return "Environment";
  if (/gps/.test(n)) return "GPS";
  if (/beacon|marker|lap number|delta|elapsed|straight speed|corner speed|realtime loss|ffb/.test(n)) return "Session";
  return "Telemetry";
}
const DOMAIN_COLOR = {
  Telemetry:C.pink, Tire:C.gold, Brakes:C.orange, Aero:C.blue,
  Powertrain:C.good, Environment:C.silver2, GPS:C.silver1, Session:C.silver1,
};

// Channels whose additive-offset calibration is still pending (see findings doc)
const CAL_PENDING = new Set([
  "Throttle Pos","Brake Pos","Clutch Pos","Steering","Steering Wheel Position",
  "G Force Lat","G Force Long","G Force Vert","Fuel Level",
]);

// ── .ld binary parser (JS port of app/ingest/motec.py findings) ──
function parseLd(buf) {
  const dv = new DataView(buf);
  const u32 = o => dv.getUint32(o, true);
  const u16 = o => dv.getUint16(o, true);
  const i16 = o => dv.getInt16(o, true);
  const str = (o, len) => {
    let s = "";
    for (let i = 0; i < len; i++) { const b = dv.getUint8(o + i); if (b === 0) break; s += String.fromCharCode(b); }
    return s.trim();
  };

  const metaPtr = u32(0x08);
  const header = {
    date:   str(0x5E, 16),
    time:   str(0x7E, 16),
    driver: str(0x9E, 32),
    venue:  str(0x15E, 64),
  };

  const channels = [];
  let ptr = metaPtr;
  const seen = new Set();
  while (ptr && ptr > 0 && ptr < buf.byteLength && !seen.has(ptr)) {
    seen.add(ptr);
    const next  = u32(ptr + 0x04);
    const dptr  = u32(ptr + 0x08);
    const ns    = u32(ptr + 0x0C);
    const dsize = u16(ptr + 0x14);
    const rate  = u16(ptr + 0x16);
    const mul   = i16(ptr + 0x1A);
    const dec   = i16(ptr + 0x1E);
    const name  = str(ptr + 0x20, 32);
    const unit  = str(ptr + 0x48, 12);
    if (name) channels.push({ name, unit, rate, ns, dsize, dptr, mul: mul || 1, dec: dec || 0 });
    if (!next || next === ptr) break;
    ptr = next;
  }

  // read raw samples for a channel
  const readRaw = (ch) => {
    const out = new Array(ch.ns);
    for (let i = 0; i < ch.ns; i++) {
      const o = ch.dptr + i * ch.dsize;
      if (o + ch.dsize > buf.byteLength) { out[i] = 0; continue; }
      out[i] = ch.dsize === 1 ? dv.getInt8(o) : ch.dsize === 2 ? dv.getInt16(o, true) : dv.getInt32(o, true);
    }
    return out;
  };

  // compute raw min/max + decoded range for every channel
  for (const ch of channels) {
    let mn = Infinity, mx = -Infinity;
    const raw = readRaw(ch);
    for (const v of raw) { if (v < mn) mn = v; if (v > mx) mx = v; }
    ch.rawMin = mn; ch.rawMax = mx;
    ch.domain = domainOf(ch.name);
    ch.pending = CAL_PENDING.has(ch.name);

    const decode = r => r * ch.mul / Math.pow(10, ch.dec);
    if (ch.name === "Ground Speed") {
      // baseline-corrected: standstill (raw min) → 0
      ch.decMin = 0;
      ch.decMax = (mx - mn) * ch.mul / Math.pow(10, ch.dec);
      ch.baseline = true;
      ch.pending = false;
    } else {
      ch.decMin = decode(mn); ch.decMax = decode(mx);
    }

    // retain downsampled traces for a few confirmed channels
    if (["Engine RPM", "Gear", "Ground Speed"].includes(ch.name)) {
      const step = Math.max(1, Math.floor(ch.ns / 260));
      const pts = [];
      for (let i = 0; i < ch.ns; i += step) {
        let v = raw[i];
        v = ch.name === "Ground Speed" ? (v - mn) * ch.mul / Math.pow(10, ch.dec) : decode(v);
        pts.push(v);
      }
      ch.trace = pts;
    }
    // lap number → max lap
    if (ch.name === "Lap Number") ch.maxLap = decode(mx);
  }

  return { header, channels };
}

// ── .ldx XML parser (JS port of app/ingest/ldx.py) ────────────────
function parseLdx(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Malformed .ldx XML");
  const details = doc.querySelector("Details");
  if (!details) throw new Error(".ldx has no <Details> element");

  const summary = {};
  details.querySelectorAll("String").forEach(s => { summary[s.getAttribute("Id")] = s.getAttribute("Value"); });

  const setup = {};
  details.querySelectorAll("Numeric").forEach(n => {
    const id = n.getAttribute("Id") || "";
    if (id.startsWith("_Setup_")) {
      const key = id.slice(7);
      const value = n.getAttribute("Value") || "";
      const unit = n.getAttribute("Unit") || "";
      setup[key] = { value, unit, truncated: value.includes("(") && !value.includes(")") };
    }
  });

  const timeToS = t => {
    if (!t) return null;
    if (t.includes(":")) { const [m, r] = t.split(":"); return +m * 60 + parseFloat(r); }
    return parseFloat(t);
  };

  return {
    totalLaps: summary["Total Laps"] ? +summary["Total Laps"] : null,
    fastestLap: summary["Fastest Lap"] ? +summary["Fastest Lap"] : null,
    fastestTimeRaw: summary["Fastest Time"] || null,
    fastestTimeS: timeToS(summary["Fastest Time"]),
    setup,
  };
}

// ── .svm parser (INI + //comment) ─────────────────────────────────
function parseSvm(text) {
  const lines = text.split(/\r?\n/);
  let section = "HEADER";
  const sections = {};
  let vehicleClass = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const sec = line.match(/^\[([A-Z0-9]+)\]/);
    if (sec) { section = sec[1]; sections[section] = sections[section] || {}; continue; }
    const vc = line.match(/^VehicleClassSetting="([^"]*)"/);
    if (vc) { vehicleClass = vc[1]; continue; }
    if (line.startsWith("//") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let rest = line.slice(eq + 1);
    let comment = "";
    const ci = rest.indexOf("//");
    if (ci >= 0) { comment = rest.slice(ci + 2).trim(); rest = rest.slice(0, ci); }
    (sections[section] = sections[section] || {})[key] = { raw: rest.replace(/"/g, "").trim(), comment };
  }
  // car + class from VehicleClassSetting e.g. "Ferrari_488_GTE_EVO GTE WEC2023"
  let car = null, carClass = null, ruleset = null;
  if (vehicleClass) {
    const parts = vehicleClass.split(" ");
    car = parts[0]?.replace(/_/g, " ") || null;
    carClass = parts[1] || null;
    ruleset = parts[2] || null;
  }
  const energyType = sections.GENERAL?.VirtualEnergySetting ? "virtual_energy" : "fuel";
  return { vehicleClass, car, carClass, ruleset, energyType, sections };
}

// ══════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════

function Label({ children, color = C.pink, style }) {
  return <div style={{ fontSize: 9, letterSpacing: 2.5, fontWeight: 700, color, ...style }}>{children}</div>;
}
function Card({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, ...style }}>{children}</div>;
}
function fmtTime(s) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}

function BCLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" rx="5" fill="none" stroke={C.pink} strokeWidth="2"/><path d="M10 9L10 21 M10 9L17 9Q21 9 21 13Q21 15 18 15L10 15 M18 15Q22 15 22 19Q22 21 18 21L10 21" fill="none" stroke={C.silver3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}

// ── Trace sparkline ───────────────────────────────────────────────
function Trace({ data, color, height = 60, step = false, unit }) {
  if (!data || !data.length) return null;
  const w = 600, h = height;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const x = i => (i / (data.length - 1)) * w;
  const y = v => h - ((v - mn) / range) * (h - 8) - 4;
  let d = "";
  data.forEach((v, i) => {
    if (i === 0) d += `M${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    else if (step) d += `H${x(i).toFixed(1)}V${y(v).toFixed(1)}`;
    else d += `L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── File dropzone ─────────────────────────────────────────────────
function Dropzone({ files, onFiles, onParse, status }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handle = useCallback((fileList) => {
    const next = { ...files };
    for (const f of fileList) {
      const ext = f.name.toLowerCase().split(".").pop();
      if (ext === "ld") next.ld = f;
      else if (ext === "ldx") next.ldx = f;
      else if (ext === "svm") next.svm = f;
    }
    onFiles(next);
  }, [files, onFiles]);

  const ready = files.ld && files.ldx && files.svm;
  const slots = [
    { key: "ld",  label: ".ld",  desc: "Telemetry (binary)" },
    { key: "ldx", label: ".ldx", desc: "Laps + setup (XML)" },
    { key: "svm", label: ".svm", desc: "Raw setup (INI)" },
  ];

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? C.pink : C.line}`, borderRadius: 12,
          background: drag ? C.pinkBg : C.panel, padding: "26px 22px", textAlign: "center",
          cursor: "pointer", transition: "all .15s",
        }}>
        <input ref={inputRef} type="file" multiple accept=".ld,.ldx,.svm" style={{ display: "none" }}
          onChange={e => handle(e.target.files)} />
        <div style={{ fontSize: 13, color: C.silver2, marginBottom: 4 }}>
          Drop your <b style={{ color: C.pink }}>.ld</b>, <b style={{ color: C.pink }}>.ldx</b> and <b style={{ color: C.pink }}>.svm</b> files here
        </div>
        <div style={{ fontSize: 11, color: C.dim }}>or click to browse · all three required per session</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
        {slots.map(s => {
          const f = files[s.key];
          return (
            <Card key={s.key} style={{ padding: "11px 13px", borderColor: f ? C.pinkBd : C.line }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: f ? C.pink : C.dim, fontFamily: "monospace" }}>{s.label}</span>
                <span style={{ fontSize: 13, color: f ? C.good : C.line }}>{f ? "✓" : "○"}</span>
              </div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>{s.desc}</div>
              <div style={{ fontSize: 9.5, color: f ? C.silver2 : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f ? `${f.name} · ${(f.size / 1024).toFixed(0)} KB` : "waiting…"}
              </div>
            </Card>
          );
        })}
      </div>

      <button
        onClick={onParse}
        disabled={!ready || status === "parsing"}
        style={{
          width: "100%", marginTop: 14, padding: "11px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          background: ready && status !== "parsing" ? C.pink : C.panel2,
          color: ready && status !== "parsing" ? "#fff" : C.dim,
          border: ready ? "none" : `1px solid ${C.line}`, borderRadius: 8,
          cursor: ready && status !== "parsing" ? "pointer" : "default",
        }}>
        {status === "parsing" ? "PARSING…" : ready ? "PARSE SESSION ↗" : "ALL THREE FILES REQUIRED"}
      </button>
    </div>
  );
}

// ── Ingest status pipeline ────────────────────────────────────────
function IngestStatus({ status }) {
  const steps = ["pending", "parsing", "complete"];
  const idx = status === "failed" ? 1 : steps.indexOf(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      {steps.map((s, i) => {
        const done = i < idx || status === "complete";
        const active = i === idx && status !== "complete";
        const failed = status === "failed" && i === 1;
        const col = failed ? C.risk : done ? C.good : active ? C.pink : C.line;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: col,
                animation: active ? "pulse 1.1s infinite" : "none" }} />
              <span style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: col }}>
                {failed && i === 1 ? "FAILED" : s.toUpperCase()}
              </span>
            </div>
            {i < steps.length - 1 && <span style={{ width: 22, height: 1, background: C.line }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Setup sheet ───────────────────────────────────────────────────
function SetupSheet({ ldx, svm }) {
  const get = (key) => {
    const v = ldx.setup[key];
    if (!v) return null;
    if (v.truncated) {
      // prefer svm comment for truncated fields
      return { value: v.value + " ⚠", unit: v.unit, note: "truncated in .ldx" };
    }
    return { value: v.value, unit: v.unit };
  };

  const Row = ({ label, k }) => {
    const v = get(k);
    if (!v || v.value === "N/A" || v.value === "" || v.value === "0") return null;
    return (
      <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 11, color: C.silver2 }}>{label}</span>
        <span style={{ fontSize: 11, color: C.silver3, fontFamily: "monospace" }}>
          {v.value} {v.unit}{v.note && <span style={{ color: C.gold, fontSize: 8 }}> ({v.note})</span>}
        </span>
      </div>
    );
  };

  const groups = [
    { title: "AERO", rows: [["Front wing", "FW"], ["Rear wing", "RW"], ["Brake duct F", "BrakeDuct"], ["Brake duct R", "BrakeDuctRear"]] },
    { title: "SUSPENSION", rows: [["Front anti-sway", "FrontAntiSway"], ["Rear anti-sway", "RearAntiSway"], ["Front toe", "FrontToeIn"], ["Rear toe", "RearToeIn"]] },
    { title: "DRIVETRAIN", rows: [["Diff power", "DiffPower"], ["Diff coast", "DiffCoast"], ["Diff preload", "DiffPreload"], ["Final drive split", "RearSplit"]] },
    { title: "CONTROLS", rows: [["Steer lock", "SteerLock"], ["Brake bias R", "RearBrake"], ["Brake pressure", "BrakePressure"], ["TC map", "TractionControlMap"], ["Engine mixture", "EngineMixture"], ["Rev limit", "RevLimit"]] },
    { title: "FRONT LEFT", rows: [["Camber", "FLCamber"], ["Pressure", "FLPressure"], ["Spring", "FLSpring"], ["Ride height", "FLRideHeight"], ["Compound", "FLCompound"]] },
    { title: "REAR LEFT", rows: [["Camber", "RLCamber"], ["Pressure", "RLPressure"], ["Spring", "RLSpring"], ["Ride height", "RLRideHeight"], ["Compound", "RLCompound"]] },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {groups.map(g => (
        <Card key={g.title} style={{ padding: "13px 15px" }}>
          <Label style={{ marginBottom: 9 }}>{g.title}</Label>
          {g.rows.map(([label, k]) => <Row key={k} label={label} k={k} />)}
        </Card>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function App() {
  const [files, setFiles] = useState({ ld: null, ldx: null, svm: null });
  const [status, setStatus] = useState("idle");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState("All");

  const parse = async () => {
    setStatus("parsing"); setError(null); setParsed(null);
    try {
      const [ldBuf, ldxText, svmText] = await Promise.all([
        files.ld.arrayBuffer(), files.ldx.text(), files.svm.text(),
      ]);
      // small delay so the pipeline animation is visible
      await new Promise(r => setTimeout(r, 350));
      const ld = parseLd(ldBuf);
      const ldx = parseLdx(ldxText);
      const svm = parseSvm(svmText);
      setParsed({ ld, ldx, svm });
      setStatus("complete");
    } catch (e) {
      setError(e.message || String(e));
      setStatus("failed");
    }
  };

  const reset = () => { setFiles({ ld: null, ldx: null, svm: null }); setParsed(null); setStatus("idle"); setError(null); };

  const domains = parsed ? ["All", ...Array.from(new Set(parsed.ld.channels.map(c => c.domain)))] : [];
  const shownChannels = parsed ? parsed.ld.channels.filter(c => channelFilter === "All" || c.domain === channelFilter) : [];
  const maxLapCh = parsed?.ld.channels.find(c => c.name === "Lap Number");
  const rpmCh = parsed?.ld.channels.find(c => c.name === "Engine RPM");
  const gearCh = parsed?.ld.channels.find(c => c.name === "Gear");
  const speedCh = parsed?.ld.channels.find(c => c.name === "Ground Speed");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Helvetica Neue',sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fade .3s ease forwards}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#26262c;border-radius:3px}
      `}</style>

      {/* Header */}
      <div style={{ padding: "13px 24px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, background: C.panel }}>
        <BCLogo />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>BYTECRAFT <span style={{ color: C.pink }}>RACING</span></div>
          <div style={{ fontSize: 9, color: C.dim }}>Session Upload &amp; Telemetry Viewer</div>
        </div>
        {parsed && <button onClick={reset} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.dim, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>NEW UPLOAD</button>}
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 22px 60px" }}>

        {/* Upload */}
        {!parsed && (
          <div className="fade">
            <Label style={{ marginBottom: 12 }}>UPLOAD SESSION</Label>
            <Dropzone files={files} onFiles={setFiles} onParse={parse} status={status} />
            {status !== "idle" && (
              <div style={{ marginTop: 16 }}>
                <IngestStatus status={status} />
                {status === "failed" && <div style={{ marginTop: 8, fontSize: 11, color: C.risk }}>⚠ {error}</div>}
              </div>
            )}
            <Card style={{ padding: "13px 15px", marginTop: 18 }}>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                Every session is uploaded as a matched set: the <b style={{ color: C.silver2 }}>.ld</b> telemetry file,
                its <b style={{ color: C.silver2 }}>.ldx</b> companion (laps + decoded setup), and the
                <b style={{ color: C.silver2 }}> .svm</b> raw setup. All three are parsed in-browser here.
                The internal system links them at the session level and the agents reason from the combined picture —
                telemetry as effect, setup as cause.
              </div>
            </Card>
          </div>
        )}

        {/* Results */}
        {parsed && (
          <div className="fade">
            <IngestStatus status="complete" />

            {/* Session header */}
            <Card style={{ padding: "16px 18px", marginTop: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.silver3 }}>{parsed.ld.header.venue || "Unknown venue"}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                    {parsed.svm.car || "—"} · <span style={{ color: C.pink }}>{parsed.svm.carClass || "?"}</span> {parsed.svm.ruleset || ""}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {parsed.ld.header.driver} · {parsed.ld.header.date} {parsed.ld.header.time}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 22 }}>
                  <div><div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>LAPS</div><div style={{ fontSize: 20, fontWeight: 900, color: C.silver3 }}>{parsed.ldx.totalLaps ?? "—"}</div></div>
                  <div><div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>FASTEST LAP</div><div style={{ fontSize: 20, fontWeight: 900, color: C.gold }}>{parsed.ldx.fastestLap ?? "—"}</div></div>
                  <div><div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>FASTEST TIME</div><div style={{ fontSize: 20, fontWeight: 900, color: C.pink, fontFamily: "monospace" }}>{parsed.ldx.fastestTimeRaw ?? "—"}</div></div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.good, border: `1px solid ${C.good}55`, borderRadius: 4, padding: "3px 8px" }}>{parsed.ld.channels.length} CHANNELS</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: parsed.svm.energyType === "virtual_energy" ? C.blue : C.gold, border: `1px solid ${parsed.svm.energyType === "virtual_energy" ? C.blue : C.gold}55`, borderRadius: 4, padding: "3px 8px" }}>
                  {parsed.svm.energyType === "virtual_energy" ? "⚡ VIRTUAL ENERGY" : "⛽ FUEL"}
                </span>
                {maxLapCh && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.silver2, border: `1px solid ${C.line}`, borderRadius: 4, padding: "3px 8px" }}>LD MAX LAP: {Math.round(maxLapCh.decMax)}</span>}
              </div>
            </Card>

            {/* Confirmed telemetry traces */}
            <Label style={{ marginBottom: 10 }}>TELEMETRY TRACES · CONFIRMED DECODE</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 8 }}>
              {speedCh?.trace && (
                <Card style={{ padding: "12px 15px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.pink, letterSpacing: 1 }}>GROUND SPEED</span>
                    <span style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>0 – {Math.round(speedCh.decMax)} km/h · baseline-corrected</span>
                  </div>
                  <Trace data={speedCh.trace} color={C.pink} height={64} />
                </Card>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {rpmCh?.trace && (
                  <Card style={{ padding: "12px 15px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, letterSpacing: 1 }}>ENGINE RPM</span>
                      <span style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>0 – {Math.round(rpmCh.decMax)}</span>
                    </div>
                    <Trace data={rpmCh.trace} color={C.blue} height={56} />
                  </Card>
                )}
                {gearCh?.trace && (
                  <Card style={{ padding: "12px 15px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.good, letterSpacing: 1 }}>GEAR</span>
                      <span style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>{Math.round(gearCh.decMin)} – {Math.round(gearCh.decMax)}</span>
                    </div>
                    <Trace data={gearCh.trace} color={C.good} height={56} step />
                  </Card>
                )}
              </div>
            </div>
            <div style={{ fontSize: 9.5, color: C.dim, marginBottom: 20, fontStyle: "italic" }}>
              Speed, RPM and gear use the confirmed decode formula (raw × mul / 10^dec). Channels marked
              <span style={{ color: C.gold }}> CAL</span> below still need the additive-offset calibration pass.
            </div>

            {/* Channel inventory */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Label>CHANNEL INVENTORY · {parsed.ld.channels.length}</Label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {domains.map(d => (
                  <span key={d} onClick={() => setChannelFilter(d)} style={{
                    cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "3px 8px", borderRadius: 5,
                    color: channelFilter === d ? "#fff" : (DOMAIN_COLOR[d] || C.dim),
                    background: channelFilter === d ? (DOMAIN_COLOR[d] || C.pink) : "transparent",
                    border: `1px solid ${channelFilter === d ? "transparent" : C.line}`,
                  }}>{d}</span>
                ))}
              </div>
            </div>
            <Card style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.5fr 0.7fr 1fr 0.5fr", padding: "8px 15px", borderBottom: `1px solid ${C.line}`, fontSize: 8, color: C.dim, fontWeight: 700, letterSpacing: 1 }}>
                <span>CHANNEL</span><span>UNIT</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>SAMPLES</span><span style={{ textAlign: "right" }}>DECODED RANGE</span><span style={{ textAlign: "right" }}></span>
              </div>
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {shownChannels.map((c, i) => (
                  <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.5fr 0.7fr 1fr 0.5fr", padding: "7px 15px", borderBottom: i < shownChannels.length - 1 ? `1px solid ${C.line}` : "none", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: DOMAIN_COLOR[c.domain] || C.dim, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.silver3 }}>{c.name}</span>
                    </span>
                    <span style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>{c.unit || "—"}</span>
                    <span style={{ fontSize: 10, color: C.silver2, fontFamily: "monospace", textAlign: "right" }}>{c.rate}Hz</span>
                    <span style={{ fontSize: 10, color: C.silver2, fontFamily: "monospace", textAlign: "right" }}>{c.ns.toLocaleString()}</span>
                    <span style={{ fontSize: 10, color: c.pending ? C.dim : C.silver2, fontFamily: "monospace", textAlign: "right" }}>
                      {c.pending ? `raw ${c.rawMin}…${c.rawMax}` : `${c.decMin.toFixed(c.dec > 0 ? 1 : 0)} … ${c.decMax.toFixed(c.dec > 0 ? 1 : 0)}`}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {c.pending
                        ? <span style={{ fontSize: 7.5, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 3, padding: "1px 4px" }}>CAL</span>
                        : <span style={{ fontSize: 9, color: C.good }}>✓</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Setup sheet */}
            <Label style={{ marginTop: 24, marginBottom: 10 }}>CAR SETUP · FROM .LDX <span style={{ color: C.dim, fontWeight: 400 }}>(.svm fallback for truncated fields)</span></Label>
            <SetupSheet ldx={parsed.ldx} svm={parsed.svm} />

            <div style={{ marginTop: 16, fontSize: 9.5, color: C.dim, fontStyle: "italic", lineHeight: 1.6 }}>
              This is exactly the picture the Race Engineer agents consume: the confirmed telemetry channels above,
              linked to the setup that produced them. The setup snapshot becomes the cached per-run context —
              small, static, and cache-friendly, so it strengthens the cost model rather than straining it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
