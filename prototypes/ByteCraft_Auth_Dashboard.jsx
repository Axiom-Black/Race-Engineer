import { useState } from "react";

// ── Brand tokens ─────────────────────────────────────────────────
const C = {
  bg:      "#0A0A0C",
  panel:   "#101013",
  panel2:  "#15151A",
  line:    "#222228",
  pink:    "#FF2D78",
  pinkBg:  "rgba(255,45,120,0.09)",
  pinkBd:  "rgba(255,45,120,0.25)",
  orange:  "#FF8710",
  oBg:     "rgba(255,135,16,0.09)",
  oBd:     "rgba(255,135,16,0.25)",
  silver1: "#6E7278",
  silver2: "#B0B5BB",
  silver3: "#E8EAED",
  text:    "#D6D8DC",
  dim:     "#6E7278",
  good:    "#5BD6A0",
  warn:    "#E8C24A",
  danger:  "#FF5555",
};

// ── Data ─────────────────────────────────────────────────────────
const PLANS = [
  { id:"rookie",   name:"Rookie",   price:"Free",    quick:12,  standard:1,  deep:0,  seats:1   },
  { id:"driver",   name:"Driver",   price:"$9/mo",   quick:-1,  standard:10, deep:0,  seats:1   },
  { id:"engineer", name:"Engineer", price:"$19/mo",  quick:-1,  standard:30, deep:3,  seats:1   },
  { id:"garage",   name:"Garage",   price:"$39/mo",  quick:-1,  standard:45, deep:9,  seats:50  },
  { id:"paddock",  name:"Paddock",  price:"$99+/mo", quick:-1,  standard:-1, deep:-1, seats:200 },
];

const DEMO = {
  driver: {
    name:"Alex Chen", email:"alex@example.com", role:"driver",
    plan:"engineer", avatar:"AC", garage:null,
    usage:{ quick:18, standard:8, deep:1 },
  },
  garageAdmin: {
    name:"Sam Torres", email:"sam@scuderia.racing", role:"garage-admin",
    plan:"garage", avatar:"ST", garage:"Scuderia Digital",
    usage:{ quick:44, standard:17, deep:3 },
  },
  productAdmin: {
    name:"O. Agbata", email:"admin@bytecraft.racing", role:"product-admin",
    plan:"paddock", avatar:"OA", garage:null,
    usage:{},
  },
};

const TEAM = [
  { id:1, name:"Alex Chen",     email:"alex@scuderia.racing",  av:"AC", status:"active",  sessions:12, quick:22, std:8,  deep:1 },
  { id:2, name:"Priya Nair",    email:"priya@scuderia.racing", av:"PN", status:"active",  sessions:8,  quick:15, std:5,  deep:0 },
  { id:3, name:"Marco Bianchi", email:"marco@scuderia.racing", av:"MB", status:"active",  sessions:22, quick:31, std:11, deep:2 },
  { id:4, name:"Sarah Kim",     email:"sarah@scuderia.racing", av:"SK", status:"pending", sessions:0,  quick:0,  std:0,  deep:0 },
  { id:5, name:"Luca Ricci",    email:"luca@scuderia.racing",  av:"LR", status:"active",  sessions:5,  quick:9,  std:3,  deep:0 },
];

const GARAGES = [
  { id:1, name:"Scuderia Digital",   admin:"Sam Torres",  members:5,  plan:"garage",  sessions:47,  mrr:39  },
  { id:2, name:"Apex Collective",    admin:"Jordan Wu",   members:12, plan:"paddock", sessions:189, mrr:149 },
  { id:3, name:"Night Shift Racing", admin:"Dev Patel",   members:3,  plan:"garage",  sessions:28,  mrr:39  },
  { id:4, name:"SimCenter EU",       admin:"Clara Berg",  members:47, plan:"paddock", sessions:312, mrr:299 },
];

const SOLOS = [
  { id:10, name:"Kieran Walsh",     plan:"engineer", sessions:31, last:"Today"     },
  { id:11, name:"Yuki Tanaka",      plan:"driver",   sessions:14, last:"Yesterday" },
  { id:12, name:"Fatima Al-Rashid", plan:"rookie",   sessions:3,  last:"3 days ago"},
  { id:13, name:"Carlos Ruiz",      plan:"driver",   sessions:7,  last:"5 days ago"},
];

const SESSIONS = [
  { id:1, track:"Circuit de la Sarthe", car:"GTE — Ferrari 488 GTE Evo", type:"Qualifying", date:"Jun 18", laps:5,  best:"3:51.900" },
  { id:2, track:"Circuit de la Sarthe", car:"GTE — Ferrari 488 GTE Evo", type:"Practice",   date:"Jun 15", laps:12, best:"3:52.312" },
  { id:3, track:"Spa-Francorchamps",    car:"GTE — Ferrari 488 GTE Evo", type:"Race",        date:"Jun 10", laps:22, best:"2:26.104" },
];

// ── Atoms ─────────────────────────────────────────────────────────
function Av({ i, s = 32, bg = C.pinkBg, col = C.pink }) {
  return (
    <div style={{ width: s, height: s, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: s * 0.34, fontWeight: 700, color: col, flexShrink: 0, letterSpacing: 0.5 }}>
      {i}
    </div>
  );
}

function PlanBadge({ plan }) {
  const col = { rookie: C.dim, driver: C.silver2, engineer: "#4FA3FF", garage: C.pink, paddock: C.orange }[plan] || C.dim;
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: col, border: `1px solid ${col}55`, borderRadius: 4, padding: "2px 7px" }}>{plan.toUpperCase()}</span>;
}

function Dot({ status }) {
  const col = status === "active" ? C.good : status === "pending" ? C.warn : C.dim;
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0 }} />;
}

function QBar({ label, used, limit }) {
  if (limit === 0) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: C.dim, width: 60, flexShrink: 0, letterSpacing: 0.5 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: C.line, borderRadius: 2 }} />
      <span style={{ fontSize: 10, color: C.dim, minWidth: 70, textAlign: "right" }}>Not included</span>
    </div>
  );
  const unlimited = limit === -1;
  const pct = unlimited ? 100 : Math.min(100, (used / limit) * 100);
  const over = !unlimited && used >= limit;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: C.dim, width: 60, flexShrink: 0, letterSpacing: 0.5 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: C.line, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: over ? C.danger : unlimited ? "#4FA3FF" : C.pink, borderRadius: 2, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 10, color: over ? C.danger : C.silver2, minWidth: 70, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>
        {unlimited ? "Unlimited" : `${used} / ${limit}`}
      </span>
    </div>
  );
}

function BCLogo({ accent = C.pink }) {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="24" height="24" rx="5" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M10 9L10 21 M10 9L17 9Q21 9 21 13Q21 15 18 15L10 15 M18 15Q22 15 22 19Q22 21 18 21L10 21"
        fill="none" stroke={C.silver3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppHeader({ user, onLogout, accent = C.pink, sub }) {
  return (
    <div style={{ padding: "13px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, background: C.panel }}>
      <BCLogo accent={accent} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>
          BYTECRAFT <span style={{ color: accent }}>RACING</span>
        </div>
        {sub && <div style={{ fontSize: 9, color: C.dim, letterSpacing: 0.5, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Av i={user.avatar} s={32} bg={accent === C.orange ? C.oBg : C.pinkBg} col={accent} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.silver3 }}>{user.name}</div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 1 }}>
            {user.role === "product-admin" ? "Product Admin · Axiom Black" : user.role === "garage-admin" ? `Garage Admin · ${user.garage}` : "Driver"}
          </div>
        </div>
        <button onClick={onLogout} className="btn ghost" style={{ fontSize: 11, padding: "5px 10px" }}>Sign out</button>
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onSelect, accent = C.pink }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, padding: "0 22px", background: C.panel, overflowX: "auto" }}>
      {tabs.map(t => (
        <div key={t} onClick={() => onSelect(t)} style={{ padding: "11px 14px", fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: active === t ? accent : C.dim, borderBottom: `2px solid ${active === t ? accent : "transparent"}`, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", transition: "color .2s" }}>
          {t}
        </div>
      ))}
    </div>
  );
}

function Stub({ msg }) {
  return (
    <div style={{ padding: "48px 22px", textAlign: "center", color: C.dim, fontSize: 12 }}>
      <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>⚙</div>
      {msg}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, ...style }}>{children}</div>;
}

function StatCard({ label, value, sub }) {
  return (
    <Card style={{ padding: "13px 15px" }}>
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.silver3, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onSignup }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 22px", background: C.bg }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <BCLogo accent={C.pink} />
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1.5, color: C.silver3, marginTop: 10 }}>
          BYTECRAFT <span style={{ color: C.pink }}>RACING</span>
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 3, letterSpacing: 0.5 }}>Race Engineering Agent</div>
      </div>

      <Card style={{ width: "100%", maxWidth: 360, padding: "26px 22px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.silver3, marginBottom: 20 }}>Sign in to your account</div>

        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 5 }}>EMAIL</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            style={{ width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 12px", color: C.silver3, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 5 }}>PASSWORD</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
            style={{ width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 12px", color: C.silver3, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>

        <button onClick={() => onLogin("driver")} style={{ width: "100%", padding: "10px", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, background: C.pink, color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", marginBottom: 14 }}>
          SIGN IN ↗
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: C.dim }}>
          No account?{" "}
          <span onClick={onSignup} style={{ color: C.pink, cursor: "pointer" }}>Create one →</span>
        </div>
      </Card>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 9, color: C.dim, textAlign: "center", marginBottom: 10, letterSpacing: 1.5 }}>DEMO ACCOUNTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
          {[
            { key: "driver",       label: "Driver",        sub: "Engineer plan",      accent: C.pink   },
            { key: "garageAdmin",  label: "Garage Admin",  sub: "Scuderia Digital",   accent: C.pink   },
            { key: "productAdmin", label: "Product Admin", sub: "Axiom Black",        accent: C.orange },
          ].map(({ key, label, sub, accent }) => (
            <button key={key} onClick={() => onLogin(key)}
              style={{ padding: "13px 10px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, cursor: "pointer", textAlign: "center", transition: "border-color .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.line}>
              <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{sub}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: "10px 13px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 10, color: C.dim, lineHeight: 1.5 }}>
          Production auth via Clerk JWT. Role is enforced server-side — Product Admin and Garage Admin views are fully gated at the API level.
        </div>
      </div>
    </div>
  );
}

// ── SIGNUP ────────────────────────────────────────────────────────
function SignupScreen({ onBack, onComplete }) {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", pw: "", garage: "" });

  const planAccent = { rookie: C.dim, driver: C.silver2, engineer: "#4FA3FF", garage: C.pink, paddock: C.orange };

  if (step === 0) return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 22px", boxSizing: "border-box" }}>
      <button onClick={onBack} style={{ fontSize: 11, color: C.dim, background: "transparent", border: "none", cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", gap: 5 }}>
        ← Back to sign in
      </button>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.silver3, marginBottom: 4 }}>Choose your plan</div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 20 }}>You can upgrade or change plans at any time.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {PLANS.map(p => {
            const sel = plan === p.id;
            const ac = planAccent[p.id];
            return (
              <div key={p.id} onClick={() => setPlan(p.id)}
                style={{ background: C.panel, border: `1px solid ${sel ? ac : C.line}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "border-color .2s" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ac }}>{p.name}</span>
                    {p.id === "engineer" && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, background: C.pinkBg, color: C.pink, padding: "2px 7px", borderRadius: 4 }}>POPULAR</span>}
                    {p.id === "garage" && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, background: C.pinkBg, color: C.pink, padding: "2px 7px", borderRadius: 4 }}>2–50 SEATS</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
                    Quick: {p.quick === -1 ? "Unlimited" : `${p.quick}/mo`}  ·  Standard: {p.standard === -1 ? "Unlimited" : `${p.standard}/mo`}  ·  Deep: {p.deep === 0 ? "None" : p.deep === -1 ? "Unlimited" : `${p.deep}/mo`}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: sel ? ac : C.silver1 }}>{p.price}</div>
              </div>
            );
          })}
        </div>
        <button disabled={!plan} onClick={() => setStep(1)}
          style={{ width: "100%", padding: "11px", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, background: plan ? C.pink : C.panel2, color: plan ? "#fff" : C.dim, border: plan ? "none" : `1px solid ${C.line}`, borderRadius: 7, cursor: plan ? "pointer" : "default" }}>
          CONTINUE WITH {plan ? PLANS.find(p => p.id === plan)?.name.toUpperCase() : "PLAN"} →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 22px", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box" }}>
      <button onClick={() => setStep(0)} style={{ fontSize: 11, color: C.dim, background: "transparent", border: "none", cursor: "pointer", marginBottom: 20, alignSelf: "flex-start" }}>
        ← Back to plans
      </button>
      <Card style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.silver3, marginBottom: 6 }}>Create your account</div>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <PlanBadge plan={plan} />
          <span style={{ fontSize: 11, color: C.dim }}>· {PLANS.find(p => p.id === plan)?.price}/mo</span>
        </div>
        {[
          { f: "name",    l: "Full name",    t: "text",     ph: "Your name" },
          { f: "email",   l: "Email",        t: "email",    ph: "you@example.com" },
          ...(plan === "garage" ? [{ f: "garage", l: "Garage name", t: "text", ph: "e.g. Scuderia Digital" }] : []),
          { f: "pw",      l: "Password",     t: "password", ph: "Create a password" },
        ].map(({ f, l, t, ph }) => (
          <div key={f} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 5 }}>{l.toUpperCase()}</div>
            <input type={t} value={form[f]} onChange={e => setForm(x => ({ ...x, [f]: e.target.value }))} placeholder={ph}
              style={{ width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 12px", color: C.silver3, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        ))}
        <button onClick={() => onComplete({ ...DEMO.driver, name: form.name || "New Driver", plan })}
          style={{ width: "100%", marginTop: 6, padding: "10px", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, background: C.pink, color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" }}>
          CREATE ACCOUNT ↗
        </button>
        <div style={{ fontSize: 10, color: C.dim, textAlign: "center", marginTop: 12 }}>By creating an account you agree to the Terms of Service.</div>
      </Card>
    </div>
  );
}

// ── DRIVER DASHBOARD ──────────────────────────────────────────────
function DriverDash({ user, onLogout }) {
  const [tab, setTab] = useState("SESSIONS");
  const plan = PLANS.find(p => p.id === user.plan) || PLANS[2];
  const { quick, standard, deep } = user.usage;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>
      <AppHeader user={user} onLogout={onLogout} />

      {/* Quota bar */}
      <div style={{ background: C.panel2, borderBottom: `1px solid ${C.line}`, padding: "9px 22px", display: "flex", alignItems: "center", gap: 16 }}>
        <PlanBadge plan={user.plan} />
        <div style={{ flex: 1, display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}><QBar label="QUICK" used={quick} limit={plan.quick} /></div>
          <div style={{ flex: 1 }}><QBar label="STANDARD" used={standard} limit={plan.standard} /></div>
          <div style={{ flex: 1 }}><QBar label="DEEP" used={deep} limit={plan.deep} /></div>
        </div>
      </div>

      <TabBar tabs={["SESSIONS", "RACE ENGINEER", "PROGRESSION", "LIBRARIES"]} active={tab} onSelect={setTab} />

      <div style={{ padding: "22px", maxWidth: 900, margin: "0 auto" }}>
        {tab === "SESSIONS" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: C.pink, letterSpacing: 2, fontWeight: 700 }}>RECENT SESSIONS</div>
              <button style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.pink, background: C.pinkBg, border: `1px solid ${C.pinkBd}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>
                + UPLOAD SESSION
              </button>
            </div>
            {SESSIONS.map(s => (
              <Card key={s.id} style={{ padding: "13px 16px", marginBottom: 9, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3 }}>{s.track}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{s.car}  ·  {s.type}  ·  {s.date}  ·  {s.laps} laps</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.pink, fontFamily: "'JetBrains Mono', monospace" }}>{s.best}</div>
                  <div style={{ fontSize: 9, color: C.dim, marginTop: 2, letterSpacing: 1 }}>BEST LAP</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "RACE ENGINEER" && (
          <div>
            <div style={{ fontSize: 9, color: C.pink, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>RUN CLASS</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 20 }}>Select a session then engage the agent. Runs draw from your monthly allowance.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { id: "quick",    label: "Quick Check",   desc: "3 specialists · Haiku",      cost: "~$0.04/run", color: C.silver2,  used: quick,    limit: plan.quick    },
                { id: "standard", label: "Standard Run",  desc: "All agents · Sonnet brain",  cost: "~$0.18/run", color: "#4FA3FF",  used: standard, limit: plan.standard },
                { id: "deep",     label: "Deep Run",      desc: "All agents · Opus synthesis", cost: "~$0.26/run", color: C.pink,     used: deep,     limit: plan.deep     },
              ].map(r => {
                const gated = r.limit === 0;
                const over  = !gated && r.limit !== -1 && r.used >= r.limit;
                const ok    = !gated && !over;
                return (
                  <Card key={r.id} style={{ padding: "16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: gated ? C.dim : r.color, marginBottom: 4, letterSpacing: 0.5 }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, lineHeight: 1.5 }}>{r.desc}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>{r.cost}</div>
                    {gated ? (
                      <button style={{ width: "100%", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "8px", background: C.panel2, color: C.dim, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer" }}>
                        UPGRADE TO UNLOCK
                      </button>
                    ) : over ? (
                      <button style={{ width: "100%", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "8px", background: `rgba(232,194,74,0.1)`, color: C.warn, border: `1px solid rgba(232,194,74,0.3)`, borderRadius: 6, cursor: "pointer" }}>
                        BUY CREDITS
                      </button>
                    ) : (
                      <button style={{ width: "100%", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "8px", background: C.pinkBg, color: C.pink, border: `1px solid ${C.pinkBd}`, borderRadius: 6, cursor: "pointer" }}>
                        RUN ↗
                      </button>
                    )}
                    <div style={{ fontSize: 9, color: C.dim, marginTop: 9, textAlign: "center", letterSpacing: 0.5 }}>
                      {gated ? "Not on this plan" : r.limit === -1 ? "Unlimited" : over ? `Allowance used (${r.used}/${r.limit})` : `${r.used} / ${r.limit} used`}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {tab === "PROGRESSION" && <Stub msg="Progression tracker — gap to ideal, session trend, tier ranking" />}
        {tab === "LIBRARIES"   && <Stub msg="Published Track Notes and Vehicle Dynamics — read-only reference" />}
      </div>
    </div>
  );
}

// ── GARAGE ADMIN DASHBOARD ────────────────────────────────────────
function GarageAdminDash({ user, onLogout }) {
  const [tab, setTab] = useState("TEAM");
  const [members, setMembers] = useState(TEAM);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");

  const active    = members.filter(m => m.status === "active").length;
  const totalStd  = members.reduce((s, m) => s + m.std,  0);
  const totalDeep = members.reduce((s, m) => s + m.deep, 0);
  const totalQ    = members.reduce((s, m) => s + m.quick, 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>
      <AppHeader user={user} onLogout={onLogout} sub={`Garage admin · ${user.garage}`} />

      {/* Role scope notice */}
      <div style={{ background: C.pinkBg, borderBottom: `1px solid ${C.pinkBd}`, padding: "7px 22px", fontSize: 10, color: C.pink, letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>⚑</span>
        Garage admin scope — you can see and manage your team only. System-wide data and library management require product admin access.
      </div>

      <TabBar tabs={["TEAM", "QUOTA", "BILLING", "SETTINGS"]} active={tab} onSelect={setTab} />

      <div style={{ padding: "22px", maxWidth: 900, margin: "0 auto" }}>
        {tab === "TEAM" && (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { l: "ACTIVE MEMBERS", v: active,              of: members.length   },
                { l: "SEATS USED",     v: members.length,      of: 50               },
                { l: "SESSIONS (MO)",  v: members.reduce((s,m)=>s+m.sessions,0), of: null },
                { l: "PENDING",        v: members.filter(m=>m.status==="pending").length, of: null },
              ].map(s => (
                <Card key={s.l} style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 5 }}>{s.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.silver3 }}>
                    {s.v}{s.of !== null && <span style={{ fontSize: 12, color: C.dim }}> / {s.of}</span>}
                  </div>
                </Card>
              ))}
            </div>

            {/* Header + invite */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.pink, letterSpacing: 2, fontWeight: 700 }}>TEAM MEMBERS</div>
              <button onClick={() => setShowInvite(v => !v)}
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.pink, background: C.pinkBg, border: `1px solid ${C.pinkBd}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>
                + INVITE MEMBER
              </button>
            </div>

            {showInvite && (
              <Card style={{ padding: "13px 15px", marginBottom: 12, display: "flex", gap: 9 }}>
                <input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="teammate@example.com"
                  style={{ flex: 1, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 11px", color: C.silver3, fontSize: 12, outline: "none" }} />
                <button onClick={() => { setInvEmail(""); setShowInvite(false); }}
                  style={{ fontSize: 11, fontWeight: 700, padding: "8px 15px", background: C.pink, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  SEND INVITE
                </button>
                <button onClick={() => setShowInvite(false)} style={{ fontSize: 11, color: C.dim, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 12px", cursor: "pointer" }}>
                  CANCEL
                </button>
              </Card>
            )}

            {/* Table */}
            <Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 80px 60px 65px", padding: "8px 15px", borderBottom: `1px solid ${C.line}`, fontSize: 8, color: C.dim, fontWeight: 700, letterSpacing: 1.5, gap: 0 }}>
                <span>MEMBER</span><span style={{ textAlign:"center" }}>SESSIONS</span><span style={{ textAlign:"center" }}>QUICK</span><span style={{ textAlign:"center" }}>STANDARD</span><span style={{ textAlign:"center" }}>DEEP</span><span />
              </div>
              {members.map((m, i) => (
                <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 80px 60px 65px", padding: "11px 15px", borderBottom: i < members.length - 1 ? `1px solid ${C.line}` : "none", alignItems: "center", gap: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Av i={m.av} s={28} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.silver3 }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{m.email}</div>
                    </div>
                    <Dot status={m.status} />
                  </div>
                  <div style={{ textAlign: "center", fontSize: 12, color: m.status === "pending" ? C.dim : C.silver3 }}>{m.sessions}</div>
                  <div style={{ textAlign: "center", fontSize: 12, fontFamily: "monospace", color: C.silver2 }}>{m.quick}</div>
                  <div style={{ textAlign: "center", fontSize: 12, fontFamily: "monospace", color: C.silver2 }}>{m.std}</div>
                  <div style={{ textAlign: "center", fontSize: 12, fontFamily: "monospace", color: C.silver2 }}>{m.deep}</div>
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => setMembers(ms => ms.filter(x => x.id !== m.id))}
                      style={{ fontSize: 10, color: C.danger, background: "transparent", border: "none", cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "QUOTA" && (
          <Card style={{ padding: "18px" }}>
            <div style={{ fontSize: 9, color: C.pink, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>POOLED MONTHLY ALLOWANCE</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 18, lineHeight: 1.6 }}>
              Usage is shared across all team members. No per-seat limits — it's the garage total that counts.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <QBar label="QUICK" used={totalQ} limit={-1} />
              <QBar label="STANDARD" used={totalStd} limit={45} />
              <QBar label="DEEP" used={totalDeep} limit={9} />
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}`, fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
              Credits available if allowance runs out:  Standard — $9.99 for 25 runs  ·  Deep — $11.99 for 10 runs
            </div>
          </Card>
        )}

        {tab === "BILLING"   && <Stub msg="Billing history, payment method, and upcoming invoice" />}
        {tab === "SETTINGS"  && <Stub msg="Garage name, domain restrictions, and member permissions" />}
      </div>
    </div>
  );
}

// ── PRODUCT ADMIN DASHBOARD ───────────────────────────────────────
function ProductAdminDash({ user, onLogout }) {
  const [tab, setTab] = useState("OVERVIEW");

  const totalUsers    = SOLOS.length + GARAGES.reduce((s, g) => s + g.members, 0);
  const totalSessions = GARAGES.reduce((s, g) => s + g.sessions, 0) + SOLOS.reduce((s, u) => s + u.sessions, 0);
  const mrr           = GARAGES.reduce((s, g) => s + g.mrr, 0) + SOLOS.reduce((s, u) => s + (u.plan === "engineer" ? 19 : u.plan === "driver" ? 9 : 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>
      <AppHeader user={user} onLogout={onLogout} accent={C.orange} sub="Platform admin · Axiom Black LLC" />

      {/* Admin scope notice — orange accent distinguishes product admin from garage admin */}
      <div style={{ background: C.oBg, borderBottom: `1px solid ${C.oBd}`, padding: "7px 22px", fontSize: 10, color: C.orange, letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>⬡</span>
        Product admin — full platform access. This view is not visible to Garage Admins or Drivers. Controlled by Axiom Black LLC.
      </div>

      <TabBar tabs={["OVERVIEW", "GARAGES", "USERS", "LIBRARIES", "USAGE"]} active={tab} onSelect={setTab} accent={C.orange} />

      <div style={{ padding: "22px", maxWidth: 960, margin: "0 auto" }}>
        {tab === "OVERVIEW" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
              <StatCard label="TOTAL USERS"     value={totalUsers}            sub="Solo + garage members" />
              <StatCard label="GARAGE ACCOUNTS" value={GARAGES.length}        sub="Active teams" />
              <StatCard label="TOTAL SESSIONS"  value={totalSessions}         sub="All time, all users" />
              <StatCard label="MRR"             value={`$${mrr.toLocaleString()}`} sub="Monthly recurring" />
            </div>

            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>GARAGE ACCOUNTS</div>
            <Card style={{ marginBottom: 22 }}>
              {GARAGES.map((g, i) => (
                <div key={g.id} style={{ padding: "11px 15px", borderBottom: i < GARAGES.length - 1 ? `1px solid ${C.line}` : "none", display: "flex", alignItems: "center", gap: 12 }}>
                  <Av i={g.name.slice(0, 2).toUpperCase()} s={30} bg={C.oBg} col={C.orange} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.silver3 }}>{g.name}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>Admin: {g.admin}  ·  {g.members} members  ·  {g.sessions} sessions</div>
                  </div>
                  <PlanBadge plan={g.plan} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, width: 64, textAlign: "right" }}>${g.mrr}/mo</div>
                </div>
              ))}
            </Card>

            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>SOLO DRIVERS</div>
            <Card>
              {SOLOS.map((u, i) => (
                <div key={u.id} style={{ padding: "10px 15px", borderBottom: i < SOLOS.length - 1 ? `1px solid ${C.line}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <Av i={u.name.slice(0, 2)} s={28} />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.silver3 }}>{u.name}</div>
                  <PlanBadge plan={u.plan} />
                  <div style={{ fontSize: 10, color: C.dim, width: 72 }}>{u.sessions} sessions</div>
                  <div style={{ fontSize: 10, color: C.dim, width: 82 }}>{u.last}</div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "GARAGES" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.orange, letterSpacing: 2, fontWeight: 700 }}>ALL GARAGE ACCOUNTS ({GARAGES.length})</div>
              <button style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.orange, background: C.oBg, border: `1px solid ${C.oBd}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>+ CREATE GARAGE</button>
            </div>
            {GARAGES.map(g => (
              <Card key={g.id} style={{ padding: "14px 16px", marginBottom: 9, display: "flex", alignItems: "center", gap: 14 }}>
                <Av i={g.name.slice(0, 2).toUpperCase()} s={38} bg={C.oBg} col={C.orange} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3 }}>{g.name}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>Admin: {g.admin}  ·  {g.members} seats  ·  {g.sessions} sessions</div>
                </div>
                <PlanBadge plan={g.plan} />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>${g.mrr}/mo</div>
                <button style={{ fontSize: 11, color: C.danger, background: "transparent", border: `1px solid ${C.danger}44`, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>Suspend</button>
              </Card>
            ))}
          </div>
        )}

        {tab === "USERS" && (
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>SOLO DRIVERS ({SOLOS.length})</div>
            <Card style={{ marginBottom: 20 }}>
              {SOLOS.map((u, i) => (
                <div key={u.id} style={{ padding: "10px 15px", borderBottom: i < SOLOS.length - 1 ? `1px solid ${C.line}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <Av i={u.name.slice(0, 2)} s={30} />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.silver3 }}>{u.name}</div>
                  <PlanBadge plan={u.plan} />
                  <div style={{ fontSize: 10, color: C.dim, width: 72 }}>{u.sessions} sessions</div>
                  <div style={{ fontSize: 10, color: C.dim, width: 82 }}>{u.last}</div>
                  <button style={{ fontSize: 11, color: C.danger, background: "transparent", border: `1px solid ${C.danger}44`, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>Suspend</button>
                </div>
              ))}
            </Card>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>GARAGE MEMBERS</div>
            <Card style={{ padding: "13px 15px" }}>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                {GARAGES.reduce((s, g) => s + g.members, 0)} members across {GARAGES.length} garages. Drill into individual accounts from the Garages tab.
              </div>
            </Card>
          </div>
        )}

        {tab === "LIBRARIES" && (
          <div>
            <div style={{ padding: "10px 14px", background: C.oBg, border: `1px solid ${C.oBd}`, borderRadius: 8, fontSize: 10, color: C.orange, marginBottom: 18, lineHeight: 1.6 }}>
              ⬡  These libraries are controlled by ByteCraft (admin-only). Drivers see published content as read-only. Garage admins have no access to this panel.
            </div>
            {[
              { name: "Published Track Notes",  desc: "Corner dossiers per track and car class",        status: "8 of 11 corners published — Circuit de la Sarthe",   action: "Manage dossiers"   },
              { name: "Ideal Session Data",      desc: "Reference lap targets per scenario",              status: "Targets set: Testing, Practice, Qualifying, Race",     action: "Update targets"    },
              { name: "Vehicle Dynamics",        desc: "Theoretical frameworks — global, all users",     status: "Core frameworks published",                            action: "Manage frameworks" },
            ].map(lib => (
              <Card key={lib.name} style={{ padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.orange, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3, marginBottom: 2 }}>{lib.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{lib.desc}</div>
                  <div style={{ fontSize: 10, color: C.orange, marginTop: 3 }}>{lib.status}</div>
                </div>
                <button style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.orange, background: C.oBg, border: `1px solid ${C.oBd}`, borderRadius: 6, padding: "7px 13px", cursor: "pointer" }}>
                  {lib.action}
                </button>
              </Card>
            ))}
          </div>
        )}

        {tab === "USAGE" && <Stub msg="System-wide token usage, run cost monitoring, and billing analytics" />}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user,   setUser  ] = useState(null);

  const login = (key) => {
    setUser(DEMO[key]);
    setScreen(key === "driver" ? "driver" : key === "garageAdmin" ? "garage" : "admin");
  };

  const signup  = (u) => { setUser(u); setScreen("driver"); };
  const logout  = ()  => { setUser(null); setScreen("login"); };

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { font-family: 'DM Sans', sans-serif; }
        button { font-family: 'DM Sans', sans-serif; }
      `}</style>
      {screen === "login"  && <LoginScreen      onLogin={login} onSignup={() => setScreen("signup")} />}
      {screen === "signup" && <SignupScreen      onBack={() => setScreen("login")} onComplete={signup} />}
      {screen === "driver" && user && <DriverDash       user={user} onLogout={logout} />}
      {screen === "garage" && user && <GarageAdminDash  user={user} onLogout={logout} />}
      {screen === "admin"  && user && <ProductAdminDash user={user} onLogout={logout} />}
    </div>
  );
}
