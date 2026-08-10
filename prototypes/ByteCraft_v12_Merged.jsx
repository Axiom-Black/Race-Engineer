import { useState, useMemo, useEffect } from "react";

const API = "https://api.anthropic.com/v1/messages";
async function callClaude(system, user, maxTokens = 600) {
  const r = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:maxTokens, system, messages:[{role:"user",content:user}] }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
}
function parseJSON(raw) {
  try { return JSON.parse(raw); } catch {
    const c=raw.replace(/```json|```/g,"").trim();
    const s=c.search(/[{[]/),e=Math.max(c.lastIndexOf("}"),c.lastIndexOf("]"));
    return JSON.parse(c.slice(s,e+1));
  }
}

// ── Brand ──────────────────────────────────────────────────────────
const C = {
  bg:"#0A0A0C", panel:"#101013", panel2:"#15151A", line:"#222228",
  pink:"#FF2D78", pinkDim:"#FF2D7833", pinkBg:"rgba(255,45,120,0.09)", pinkBd:"rgba(255,45,120,0.25)",
  orange:"#FF8710", oBg:"rgba(255,135,16,0.09)", oBd:"rgba(255,135,16,0.25)",
  silver1:"#6E7278", silver2:"#B0B5BB", silver3:"#E8EAED",
  text:"#D6D8DC", textDim:"#6E7278", dim:"#6E7278",
  good:"#5BD6A0", gold:"#E8C24A", risk:"#FF5555", danger:"#FF5555",
};
const GOV = {
  bytecraft:{ tag:"BYTECRAFT", color:C.silver2, lock:true },
  user:{ tag:"YOU", color:C.pink, lock:false },
};

// ── Plans & auth data ──────────────────────────────────────────────
const PLANS = [
  { id:"rookie",   name:"Rookie",   price:"Free",    quick:12,  standard:1,  deep:0,  seats:1   },
  { id:"driver",   name:"Driver",   price:"$9/mo",   quick:-1,  standard:10, deep:0,  seats:1   },
  { id:"engineer", name:"Engineer", price:"$19/mo",  quick:-1,  standard:30, deep:3,  seats:1   },
  { id:"garage",   name:"Garage",   price:"$39/mo",  quick:-1,  standard:45, deep:9,  seats:50  },
  { id:"paddock",  name:"Paddock",  price:"$99+/mo", quick:-1,  standard:-1, deep:-1, seats:200 },
];
const DEMO = {
  driver:       { name:"Alex Chen",  email:"alex@example.com",      role:"driver",        plan:"engineer", avatar:"AC", garage:null,              usage:{quick:18,standard:8,deep:1} },
  garageAdmin:  { name:"Sam Torres", email:"sam@scuderia.racing",    role:"garage-admin",  plan:"garage",   avatar:"ST", garage:"Scuderia Digital", usage:{quick:44,standard:17,deep:3} },
  productAdmin: { name:"O. Agbata",  email:"admin@bytecraft.racing", role:"product-admin", plan:"paddock",  avatar:"OA", garage:null,              usage:{} },
};
const TEAM = [
  { id:1, name:"Alex Chen",     email:"alex@scuderia.racing",  av:"AC", status:"active",  sessions:12, quick:22, std:8,  deep:1 },
  { id:2, name:"Priya Nair",    email:"priya@scuderia.racing", av:"PN", status:"active",  sessions:8,  quick:15, std:5,  deep:0 },
  { id:3, name:"Marco Bianchi", email:"marco@scuderia.racing", av:"MB", status:"active",  sessions:22, quick:31, std:11, deep:2 },
  { id:4, name:"Sarah Kim",     email:"sarah@scuderia.racing", av:"SK", status:"pending", sessions:0,  quick:0,  std:0,  deep:0 },
  { id:5, name:"Luca Ricci",    email:"luca@scuderia.racing",  av:"LR", status:"active",  sessions:5,  quick:9,  std:3,  deep:0 },
];
const GARAGES_DATA = [
  { id:1, name:"Scuderia Digital",   admin:"Sam Torres",  members:5,  plan:"garage",  sessions:47,  mrr:39  },
  { id:2, name:"Apex Collective",    admin:"Jordan Wu",   members:12, plan:"paddock", sessions:189, mrr:149 },
  { id:3, name:"Night Shift Racing", admin:"Dev Patel",   members:3,  plan:"garage",  sessions:28,  mrr:39  },
  { id:4, name:"SimCenter EU",       admin:"Clara Berg",  members:47, plan:"paddock", sessions:312, mrr:299 },
];
const SOLOS_DATA = [
  { id:10, name:"Kieran Walsh",     plan:"engineer", sessions:31, last:"Today"     },
  { id:11, name:"Yuki Tanaka",      plan:"driver",   sessions:14, last:"Yesterday" },
  { id:12, name:"Fatima Al-Rashid", plan:"rookie",   sessions:3,  last:"3 days ago" },
  { id:13, name:"Carlos Ruiz",      plan:"driver",   sessions:7,  last:"5 days ago" },
];

// ── LMU data ───────────────────────────────────────────────────────
const CARS = {
  Hypercar:["Alpine A424","Aston Martin Valkyrie AMR-LMH","BMW M Hybrid V8","Cadillac V-Series.R","Ferrari 499P","Glickenhaus SCG 007","Isotta Fraschini Tipo 6","Lamborghini SC63","Peugeot 9X8","Peugeot 9X8 2024","Porsche 963","Toyota GR010-Hybrid","Vanwall Vandervell 680"],
  LMP2:["ORECA 07 Gibson 2023","ORECA 07 Gibson 2024"],
  LMP3:["Ginetta G61-LT-P325-Evo","Ligier JS P325"],
  LMGT3:["Aston Martin Vantage AMR LMGT3","BMW M4 LMGT3","Corvette Z06 LMGT3.R","Ferrari 296 LMGT3","Ford Mustang LMGT3","Lamborghini Huracán LMGT3 Evo2","Lexus RC F LMGT3","McLaren 720S LMGT3 Evo","Mercedes-AMG LMGT3","Porsche 911 GT3 R"],
  GTE:["Aston Martin Vantage AMR","Chevrolet Corvette C8.R","Ferrari 488 GTE Evo","Porsche 911 RSR-19"],
};
const CAR_GROUPS = Object.fromEntries(Object.entries(CARS).map(([cls,ms])=>[cls,ms.map(m=>({v:`${cls} — ${m}`,t:m}))]));
const CIRCUITS = ["Algarve International Circuit (Portimão)","Autodromo Enzo e Dino Ferrari (Imola)","Autódromo José Carlos Pace (Interlagos)","Bahrain International Circuit","Circuit de Barcelona-Catalunya","Circuit de la Sarthe","Circuit of the Americas","Circuit Paul Ricard","Fuji International Speedway","Lusail International Circuit","Monza","Sebring","Silverstone","Spa-Francorchamps"];
const ALT_LAYOUTS = ["Algarve International Circuit ELMS","Autodromo Enzo e Dino Ferrari (Imola) ELMS","Bahrain International Endurance Circuit","Bahrain International Outer Circuit","Circuit de la Sarthe — Mulsanne No Chicanes","COTA National","Fuji Classic (No Chicane)","Silverstone GP (WEC)","Silverstone International","Silverstone National","Spa Endurance Layout"];
const TRACK_GROUPS = { Circuits:CIRCUITS.map(t=>({v:t,t})), "Alternate Layouts":ALT_LAYOUTS.map(t=>({v:t,t})) };

// ── Race data ──────────────────────────────────────────────────────
const IDEAL = {
  "Circuit de la Sarthe|GTE — Ferrari 488 GTE Evo|Qualifying":230.5,
  "Circuit de la Sarthe|GTE — Ferrari 488 GTE Evo|Practice":231.0,
  "Circuit de la Sarthe|GTE — Ferrari 488 GTE Evo|Race":232.2,
  "Circuit de la Sarthe|GTE — Ferrari 488 GTE Evo|Testing":231.5,
};
const idealFor     = (t,c,s) => IDEAL[`${t}|${c}|${s}`]??null;
const idealTypesFor = (t,c)  => ["Testing","Practice","Qualifying","Race"].filter(s=>IDEAL[`${t}|${c}|${s}`]!=null);
const loadColor    = v => v==="High"?C.pink:v==="Med"?C.silver2:C.silver1;

const CORNER_NOTES = {
  "Circuit de la Sarthe|GTE — Ferrari 488 GTE Evo": [
    { n:1,  name:"Dunlop Curve",       published:true,  entry:"250 km/h", gear:"5 → 4", pos:{entry:"Track right, settle before the crest",apex:"Brush the left kerb over the rise",exit:"Feed back right, short-shift to 5th"},           risks:"Blind crest — running wide ruins the Esses entry.", load:{FL:"High",FR:"Med", RL:"Med",RR:"Low" } },
    { n:2,  name:"Esses de la Forêt",  published:true,  entry:"180 km/h", gear:"4 → 3", pos:{entry:"Carry speed in, stay left",               apex:"Flow left-right, minimal steering",             exit:"Prioritise the exit onto Tertre Rouge"},            risks:"Kerbs unsettle the rear — rhythm beats aggression.", load:{FL:"Med", FR:"Med", RL:"Med",RR:"Med" } },
    { n:3,  name:"Tertre Rouge",       published:true,  entry:"120 km/h", gear:"3",     pos:{entry:"Wide entry from the left",                 apex:"Late apex, patient on throttle",                exit:"Maximise traction — this defines Mulsanne speed"},  risks:"Early throttle snaps the rear onto the straight.", load:{FL:"Med", FR:"High",RL:"Low",RR:"High"} },
    { n:4,  name:"Mulsanne Chicane 1", published:true,  entry:"110 km/h", gear:"5 → 2", pos:{entry:"Brake in a straight line, late",           apex:"Square the first apex, sacrifice for the second",exit:"Power down early for the next straight"},           risks:"Heavy braking zone — lock-up risk at turn-in.", load:{FL:"High",FR:"High",RL:"Low",RR:"Low" } },
    { n:5,  name:"Mulsanne Chicane 2", published:true,  entry:"110 km/h", gear:"5 → 2", pos:{entry:"Same discipline — straight-line braking",  apex:"Use the full kerb on the second apex",         exit:"Settle the car before full throttle"},              risks:"Bumpy on entry — avoid trail-braking too deep.", load:{FL:"High",FR:"High",RL:"Low",RR:"Low" } },
    { n:6,  name:"Mulsanne Corner",    published:true,  entry:"95 km/h",  gear:"6 → 2", pos:{entry:"Brake very late, dead straight",           apex:"Tight 90° right, one clean apex",              exit:"Short-shift to limit wheelspin"},                   risks:"Longest braking zone on track; brake fade and lock-ups.", load:{FL:"High",FR:"Med", RL:"Med",RR:"High"} },
    { n:7,  name:"Indianapolis",       published:true,  entry:"150 km/h", gear:"4 → 3", pos:{entry:"Fast right-hander, commit early",          apex:"Clip right, then set up for Arnage",           exit:"Brief acceleration before Arnage braking"},         risks:"Banking shifts load — don't get greedy on the right kerb.", load:{FL:"Med", FR:"High",RL:"Low",RR:"Med" } },
    { n:8,  name:"Arnage",             published:true,  entry:"75 km/h",  gear:"2",     pos:{entry:"Slowest corner — heavy braking",           apex:"Single tight apex, very patient",              exit:"Smooth, progressive throttle"},                     risks:"Easy to bog down or spin the rears on exit.", load:{FL:"Med", FR:"Med", RL:"High",RR:"High"} },
    { n:9,  name:"Porsche Curves",      published:false },
    { n:10, name:"Ford Chicane 1",      published:false },
    { n:11, name:"Ford Chicane (Final)", published:false },
  ],
};

// ── Code Craft data ─────────────────────────────────────────────────
const STANDARDS = [
  { book:"Clean Agile: Back to Basics", pdf:true,  tags:["TDD — three rules","Refactoring","Simple Design (Beck's 4 rules)","Continuous Integration","Craftsmanship"] },
  { book:"Clean Architecture",          pdf:false, tags:["The Dependency Rule","SOLID","Screaming Architecture","Boundaries","Humble Objects"] },
  { book:"Clean Code",                  pdf:false, tags:["Meaningful names","Small functions — one thing","DRY / no duplication","No dead code","FIRST tests"] },
];
const REVISION_LOG = [
  { ver:"v2",  date:"2026-06-19", trigger:"Admin Dev", change:"Split monolith into orchestrator → specialists → synthesizer.",       why:"Each agent owns one responsibility.",                  std:"Clean Architecture · SRP / boundaries" },
  { ver:"v3",  date:"2026-06-20", trigger:"Admin Dev", change:"Introduced four governed libraries and tabbed structure.",             why:"Structure reflects the racing domain, not a CRUD shell.", std:"Clean Architecture · Screaming Architecture" },
  { ver:"v3",  date:"2026-06-20", trigger:"Routine",   change:"Extracted callClaude() and parseJSON() helpers.",                     why:"Same logic was duplicated across every agent call.",      std:"Clean Code · DRY; functions do one thing" },
  { ver:"v4",  date:"2026-06-23", trigger:"Admin Dev", change:"SESSION hard-filters sessions; session-aware Ideal targets.",         why:"Removed hidden coupling; one source of truth.",           std:"Clean Code · Command-Query separation" },
  { ver:"v5",  date:"2026-06-24", trigger:"Admin Dev", change:"Full LMU car/track roster in data structures.",                       why:"Separated data (policy) from rendering (detail).",        std:"Clean Architecture · Open/Closed; policy vs detail" },
  { ver:"v6",  date:"2026-06-25", trigger:"Routine",   change:"Deterministic seed generator; parameterised tierFor().",             why:"Made output testable; removed magic numbers.",            std:"Clean Code · functions; Clean Agile · testability" },
  { ver:"v8",  date:"2026-06-26", trigger:"Admin Dev", change:"Track Notes reader as isolated read-only view.",                     why:"UI detail at the boundary, decoupled from dashboards.",  std:"Clean Architecture · The Dependency Rule" },
  { ver:"v9",  date:"2026-06-26", trigger:"Admin Dev", change:"Keyed dossiers by track|class; deleted gauge code; role-gated notices.", why:"Removed dead markup; visibility logic has one owner.", std:"Clean Code · no dead code; Clean Architecture · SRP" },
  { ver:"v12", date:"2026-06-29", trigger:"Admin Dev", change:"Auth system merged; role-based routing; Code Craft → Product Admin.", why:"Proper product/garage admin separation; admin toggle replaced by real auth.", std:"Clean Architecture · SRP; Clean Agile · Simple Design" },
];

// ── Agent definitions + Run classes ───────────────────────────────
const DOMAIN_AGENTS = {
  aero:        { label:"AERODYNAMICS", tag:"AERO", system:"You are the Aerodynamics Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on wing/ride-height/aero balance. Each line: '• ' then under 18 words." },
  tire:        { label:"TIRE",         tag:"TIRE", system:"You are the Tire Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on compound, pressures, temps or wear. Each line: '• ' then under 18 words." },
  powertrain:  { label:"POWERTRAIN",   tag:"PWR",  system:"You are the Powertrain Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on fuel/hybrid deployment. Each line: '• ' then under 18 words." },
  telemetry:   { label:"TELEMETRY",    tag:"TEL",  system:"You are the Telemetry Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on braking, traction or line based on consistency/pace. Each line: '• ' then under 18 words." },
  strategy:    { label:"STRATEGY",     tag:"STR",  system:"You are the Strategy Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on run plan or targets vs the ideal. Each line: '• ' then under 18 words." },
  environment: { label:"ENVIRONMENT",  tag:"ENV",  system:"You are the Environment Agent for ByteCraft Racing. Give exactly 2 succinct, specific suggestions on weather/track-condition adaptation. Each line: '• ' then under 18 words." },
};
const RUN_CLASSES = [
  { id:"quick",    label:"Quick Check",  desc:"3 specialists · Haiku",       cost:"~$0.04/run", color:C.silver2,   maxAgents:3 },
  { id:"standard", label:"Standard Run", desc:"All agents · Sonnet brain",   cost:"~$0.18/run", color:"#4FA3FF",   maxAgents:6 },
  { id:"deep",     label:"Deep Run",     desc:"All agents · Opus synthesis", cost:"~$0.26/run", color:C.pink,      maxAgents:6 },
];

// ── Lap math ───────────────────────────────────────────────────────
const fmt = s => { if(s==null)return"—"; const m=Math.floor(s/60); return `${m}:${(s%60).toFixed(3).padStart(6,"0")}`; };
const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
const bestString = (laps,n) => { if(laps.length<n)return null; let b=Infinity; for(let i=0;i+n<=laps.length;i++)b=Math.min(b,avg(laps.slice(i,i+n))); return b; };
const metrics    = (laps,ideal) => ({ ideal,best:Math.min(...laps),worst:Math.max(...laps),mean:avg(laps),s3:bestString(laps,3),s5:bestString(laps,5),s7:bestString(laps,7),s10:bestString(laps,10) });
const tierFor    = (gap,t) => { if(gap==null)return{name:"UNRANKED",color:C.textDim}; if(gap<=t.elite)return{name:"ELITE",color:C.gold}; if(gap<=t.competitive)return{name:"COMPETITIVE",color:C.silver3}; if(gap<=t.developing)return{name:"DEVELOPING",color:C.pink}; return{name:"FOUNDATION",color:C.silver1}; };

// ── Session generator ──────────────────────────────────────────────
let _seed=42;
const rnd=()=>{_seed=(_seed*1664525+1013904223)%4294967296;return _seed/4294967296;};
const jit=a=>(rnd()-0.5)*2*a;
function genSessions(){
  const sim="LeMans Ultimate",cls="GTE — Ferrari 488 GTE Evo",track="Circuit de la Sarthe";
  const plans=[{type:"Testing",n:4,lo:6,hi:9,start:236.0,end:233.0},{type:"Practice",n:10,lo:8,hi:14,start:235.5,end:231.8},{type:"Qualifying",n:12,lo:5,hi:7,start:234.8,end:231.0},{type:"Race",n:6,lo:12,hi:20,start:236.5,end:232.9}];
  const NOTES=["Snappy on entry to Mulsanne chicane","Rears overheating after lap 4","Lifting early into Indianapolis","Traction limited out of slow corners"];
  const out=[];let idc=1;
  plans.forEach(p=>{
    let day=new Date("2026-03-01").getTime();
    for(let i=0;i<p.n;i++){
      const frac=p.n===1?1:i/(p.n-1);
      const best=+(p.start+(p.end-p.start)*frac+jit(0.25)).toFixed(3);
      const nL=Math.round(p.lo+rnd()*(p.hi-p.lo));
      const laps=[];
      for(let l=0;l<nL;l++)laps.push(+(best+(l===0?1.8:0)+Math.abs(jit(1.4))+rnd()*0.6).toFixed(3));
      laps[1%laps.length]=best;
      day+=(3+Math.floor(rnd()*7))*86400000;
      out.push({id:`g${idc++}`,sim,cls,track,type:p.type,date:new Date(day).toISOString().slice(0,10),laps,notes:i%4===0?[{t:NOTES[idc%NOTES.length],a:null}]:[]});
    }
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
const SEED=genSessions();

// ── UI atoms ───────────────────────────────────────────────────────
function Pip({status}){
  const running=status==="running";
  return <span style={{width:7,height:7,borderRadius:"50%",background:status==="running"?C.pink:status==="done"?C.silver2:status==="error"?"#FF4444":C.line,boxShadow:running?`0 0 9px ${C.pink}`:"none",animation:running?"pip 1.1s ease-in-out infinite":"none",flexShrink:0,display:"inline-block"}}/>;
}
function Label({children,color=C.pink,style}){return <div style={{fontSize:9,letterSpacing:2.5,fontWeight:700,color,...style}}>{children}</div>;}
function GovBadge({kind}){const g=GOV[kind];return <span style={{fontSize:8,fontWeight:700,letterSpacing:1,color:g.color,border:`1px solid ${g.color}55`,borderRadius:4,padding:"1px 5px",display:"inline-flex",gap:3,alignItems:"center"}}>{g.lock?"🔒":"✎"} {g.tag}</span>;}
function PlanBadge({plan}){const col={rookie:C.textDim,driver:C.silver2,engineer:"#4FA3FF",garage:C.pink,paddock:C.orange}[plan]||C.textDim;return <span style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:col,border:`1px solid ${col}55`,borderRadius:4,padding:"2px 7px"}}>{plan.toUpperCase()}</span>;}
function Av({i,s=32,bg=C.pinkBg,col=C.pink}){return <div style={{width:s,height:s,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*0.34,fontWeight:700,color:col,flexShrink:0}}>{i}</div>;}
function StatusDot({status}){const col=status==="active"?C.good:status==="pending"?C.gold:C.textDim;return <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:col,flexShrink:0}}/>;}
function QBar({label,used,limit}){
  if(limit===0)return(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:10,color:C.textDim,width:58,flexShrink:0}}>{label}</span><div style={{flex:1,height:3,background:C.line,borderRadius:2}}/><span style={{fontSize:10,color:C.textDim,minWidth:70,textAlign:"right"}}>Not included</span></div>);
  const unlimited=limit===-1,pct=unlimited?100:Math.min(100,(used/limit)*100),over=!unlimited&&used>=limit;
  return(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:10,color:C.textDim,width:58,flexShrink:0}}>{label}</span><div style={{flex:1,height:3,background:C.line,borderRadius:2,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:over?C.danger:unlimited?"#4FA3FF":C.pink,transition:"width .3s"}}/></div><span style={{fontSize:10,color:over?C.danger:C.silver2,minWidth:70,textAlign:"right",fontFamily:"monospace"}}>{unlimited?"Unlimited":`${used} / ${limit}`}</span></div>);
}
function LibRow({title,sub,kind,last,bare,onView,note,adminNote}){
  return(<div style={{paddingBottom:last?0:14,marginBottom:last?0:14,borderBottom:last?"none":`1px solid ${C.line}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
      <div style={{fontSize:bare?12:11.5,fontWeight:700,color:C.silver3}}>{title}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>{onView&&<span onClick={onView} style={{cursor:"pointer",fontSize:8,fontWeight:700,letterSpacing:1,color:C.pink,border:`1px solid ${C.pinkBd}`,borderRadius:4,padding:"2px 7px"}}>VIEW →</span>}<GovBadge kind={kind}/></div>
    </div>
    <div style={{fontSize:9.5,color:C.textDim}}>{sub}</div>
    {note&&<div style={{fontSize:9.5,color:C.silver1,marginTop:5}}>{note}</div>}
    {adminNote&&<div style={{marginTop:7,display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:7,fontWeight:700,letterSpacing:1,color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:3,padding:"1px 5px"}}>ADMIN</span><span style={{fontSize:9,color:C.gold}}>{adminNote}</span></div>}
  </div>);
}
function NoteAdder({onAdd}){
  const [v,setV]=useState("");
  return(<div style={{display:"flex",gap:8}}><input value={v} onChange={e=>setV(e.target.value)} placeholder="Add your own session note…" style={{flex:1,background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"8px 11px",color:C.silver3,fontSize:11.5,outline:"none"}}/><button onClick={()=>{if(v.trim()){onAdd(v.trim());setV("");}}} style={{background:"transparent",border:`1px solid ${C.line}`,color:C.silver2,borderRadius:7,padding:"8px 16px",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>ADD</button></div>);
}
function BCLogo({accent=C.pink}){return <svg width="26" height="26" viewBox="0 0 30 30" style={{flexShrink:0}}><rect x="3" y="3" width="24" height="24" rx="5" fill="none" stroke={accent} strokeWidth="2"/><path d="M10 9L10 21 M10 9L17 9Q21 9 21 13Q21 15 18 15L10 15 M18 15Q22 15 22 19Q22 21 18 21L10 21" fill="none" stroke={C.silver3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;}

function AppHeader({user,onLogout,accent=C.pink,sub}){
  return(<div style={{padding:"12px 22px",borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:12,background:C.panel}}>
    <BCLogo accent={accent}/>
    <div style={{flex:1}}>
      <div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:C.silver3}}>BYTECRAFT <span style={{color:accent}}>RACING</span></div>
      {sub&&<div style={{fontSize:9,color:C.textDim,marginTop:1}}>{sub}</div>}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <Av i={user.avatar} s={30} bg={accent===C.orange?C.oBg:C.pinkBg} col={accent}/>
      <div><div style={{fontSize:12,fontWeight:700,color:C.silver3}}>{user.name}</div><PlanBadge plan={user.plan}/></div>
      <button onClick={onLogout} style={{fontSize:11,color:C.textDim,background:"transparent",border:`1px solid ${C.line}`,borderRadius:5,padding:"4px 10px",cursor:"pointer",marginLeft:4}}>Sign out</button>
    </div>
  </div>);
}

// ── LOGIN ──────────────────────────────────────────────────────────
function LoginScreen({onLogin,onSignup}){
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  return(<div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 22px",background:C.bg}}>
    <div style={{textAlign:"center",marginBottom:26}}><BCLogo accent={C.pink}/><div style={{fontSize:18,fontWeight:900,letterSpacing:1.5,color:C.silver3,marginTop:10}}>BYTECRAFT <span style={{color:C.pink}}>RACING</span></div><div style={{fontSize:10,color:C.textDim,marginTop:2}}>Race Engineering Agent</div></div>
    <div style={{width:"100%",maxWidth:340,background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,padding:"24px 20px",marginBottom:14}}>
      <div style={{fontSize:15,fontWeight:700,color:C.silver3,marginBottom:20}}>Sign in to your account</div>
      <div style={{marginBottom:12}}><div style={{fontSize:9,color:C.textDim,letterSpacing:1.5,marginBottom:5}}>EMAIL</div><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{width:"100%",background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"9px 12px",color:C.silver3,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:18}}><div style={{fontSize:9,color:C.textDim,letterSpacing:1.5,marginBottom:5}}>PASSWORD</div><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={{width:"100%",background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"9px 12px",color:C.silver3,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      <button onClick={()=>onLogin("driver")} style={{width:"100%",padding:"10px",fontSize:12,fontWeight:700,letterSpacing:1.5,background:C.pink,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",marginBottom:14}}>SIGN IN ↗</button>
      <div style={{textAlign:"center",fontSize:11,color:C.textDim}}>No account? <span onClick={onSignup} style={{color:C.pink,cursor:"pointer"}}>Create one →</span></div>
    </div>
    <div style={{width:"100%",maxWidth:340}}>
      <div style={{fontSize:9,color:C.textDim,textAlign:"center",marginBottom:10,letterSpacing:1.5}}>DEMO ACCOUNTS</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
        {[{key:"driver",label:"Driver",sub:"Engineer plan",accent:C.pink},{key:"garageAdmin",label:"Garage Admin",sub:"Scuderia Digital",accent:C.pink},{key:"productAdmin",label:"Product Admin",sub:"Axiom Black",accent:C.orange}].map(({key,label,sub,accent})=>(
          <button key={key} onClick={()=>onLogin(key)} style={{padding:"13px 10px",background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.borderColor=accent} onMouseLeave={e=>e.currentTarget.style.borderColor=C.line}>
            <div style={{fontSize:12,fontWeight:700,color:accent,marginBottom:3}}>{label}</div>
            <div style={{fontSize:10,color:C.textDim}}>{sub}</div>
          </button>
        ))}
      </div>
    </div>
  </div>);
}

// ── SIGNUP ─────────────────────────────────────────────────────────
function SignupScreen({onBack,onComplete}){
  const [step,setStep]=useState(0);
  const [plan,setPlan]=useState(null);
  const [form,setForm]=useState({name:"",email:"",pw:"",garage:""});
  const pc={rookie:C.textDim,driver:C.silver2,engineer:"#4FA3FF",garage:C.pink,paddock:C.orange};
  if(step===0)return(<div style={{minHeight:"100vh",background:C.bg,padding:"28px 22px",boxSizing:"border-box"}}>
    <button onClick={onBack} style={{fontSize:11,color:C.textDim,background:"transparent",border:"none",cursor:"pointer",marginBottom:18}}>← Back to sign in</button>
    <div style={{maxWidth:480,margin:"0 auto"}}><div style={{fontSize:16,fontWeight:900,color:C.silver3,marginBottom:4}}>Choose your plan</div><div style={{fontSize:11,color:C.textDim,marginBottom:18}}>You can upgrade or change plans at any time.</div>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
        {PLANS.map(p=>{const sel=plan===p.id,ac=pc[p.id];return(<div key={p.id} onClick={()=>setPlan(p.id)} style={{background:C.panel,border:`1px solid ${sel?ac:C.line}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
          <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:13,fontWeight:700,color:ac}}>{p.name}</span>{p.id==="engineer"&&<span style={{fontSize:9,fontWeight:700,letterSpacing:1,background:C.pinkBg,color:C.pink,padding:"2px 7px",borderRadius:4}}>POPULAR</span>}{p.id==="garage"&&<span style={{fontSize:9,fontWeight:700,letterSpacing:1,background:C.pinkBg,color:C.pink,padding:"2px 7px",borderRadius:4}}>2–50 SEATS</span>}</div><div style={{fontSize:10,color:C.textDim}}>Quick: {p.quick===-1?"Unlimited":`${p.quick}/mo`} · Standard: {p.standard===-1?"Unlimited":`${p.standard}/mo`} · Deep: {p.deep===0?"None":p.deep===-1?"Unlimited":`${p.deep}/mo`}</div></div>
          <div style={{fontSize:15,fontWeight:900,color:sel?ac:C.silver1}}>{p.price}</div>
        </div>);})}
      </div>
      <button disabled={!plan} onClick={()=>setStep(1)} style={{width:"100%",padding:"11px",fontSize:12,fontWeight:700,letterSpacing:1.5,background:plan?C.pink:C.panel2,color:plan?"#fff":C.textDim,border:"none",borderRadius:7,cursor:plan?"pointer":"default"}}>CONTINUE WITH {plan?PLANS.find(p=>p.id===plan)?.name.toUpperCase():"PLAN"} →</button>
    </div></div>);
  return(<div style={{minHeight:"100vh",background:C.bg,padding:"28px 22px",display:"flex",flexDirection:"column",alignItems:"center",boxSizing:"border-box"}}>
    <button onClick={()=>setStep(0)} style={{fontSize:11,color:C.textDim,background:"transparent",border:"none",cursor:"pointer",marginBottom:18,alignSelf:"flex-start"}}>← Back to plans</button>
    <div style={{width:"100%",maxWidth:380,background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,padding:"24px 20px"}}>
      <div style={{fontSize:15,fontWeight:700,color:C.silver3,marginBottom:6}}>Create your account</div>
      <div style={{marginBottom:18,display:"flex",alignItems:"center",gap:8}}><PlanBadge plan={plan}/><span style={{fontSize:11,color:C.textDim}}>· {PLANS.find(p=>p.id===plan)?.price}/mo</span></div>
      {[{f:"name",l:"Full name",t:"text",ph:"Your name"},{f:"email",l:"Email",t:"email",ph:"you@example.com"},...(plan==="garage"?[{f:"garage",l:"Garage name",t:"text",ph:"e.g. Scuderia Digital"}]:[]),{f:"pw",l:"Password",t:"password",ph:"Create a password"}].map(({f,l,t,ph})=>(
        <div key={f} style={{marginBottom:14}}><div style={{fontSize:9,color:C.textDim,letterSpacing:1.5,marginBottom:5}}>{l.toUpperCase()}</div><input type={t} value={form[f]} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))} placeholder={ph} style={{width:"100%",background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"9px 12px",color:C.silver3,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      ))}
      <button onClick={()=>onComplete({...DEMO.driver,name:form.name||"New Driver",plan})} style={{width:"100%",padding:"10px",fontSize:12,fontWeight:700,letterSpacing:1.5,background:C.pink,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",marginBottom:12}}>CREATE ACCOUNT ↗</button>
      <div style={{fontSize:10,color:C.textDim,textAlign:"center"}}>By creating an account you agree to the Terms of Service.</div>
    </div>
  </div>);
}

// ── DRIVER APP (full Race Engineering Agent) ───────────────────────
function DriverApp({user,onLogout}){
  const [tab,setTab]=useState("sessions");
  const [sim]=useState("LeMans Ultimate");
  const [cls,setCls]=useState("GTE — Ferrari 488 GTE Evo");
  const [track,setTrack]=useState("Circuit de la Sarthe");
  const [type,setType]=useState("Qualifying");
  const [sessions,setSessions]=useState(SEED);
  const [activeId,setActiveId]=useState(null);
  const [tiers,setTiers]=useState({elite:0.5,competitive:1.5,developing:3.0});
  const [reader,setReader]=useState(false);
  const [cornerSel,setCornerSel]=useState(0);
  const [running,setRunning]=useState(false);
  const [agentPlan,setAgentPlan]=useState(null);
  const [suggestions,setSuggestions]=useState({});
  const [headline,setHeadline]=useState(null);
  const [err,setErr]=useState(null);
  const [runClass,setRunClass]=useState("standard");
  const [usage,setUsage]=useState(user.usage||{quick:0,standard:0,deep:0});
  const [draftLaps,setDraftLaps]=useState("");
  const [showUpload,setShowUpload]=useState(false);

  const userPlan=PLANS.find(p=>p.id===user.plan)||PLANS[2];
  const corners=CORNER_NOTES[`${track}|${cls}`]||[];
  const pubCount=corners.filter(c=>c.published).length;
  const active=sessions.find(s=>s.id===activeId);
  const ideal=idealFor(track,cls,active?active.type:type);
  const idealTypes=idealTypesFor(track,cls);
  const comboSessions=useMemo(()=>sessions.filter(s=>s.sim===sim&&s.cls===cls&&s.track===track),[sessions,sim,cls,track]);
  const scopedSessions=useMemo(()=>comboSessions.filter(s=>s.type===type),[comboSessions,type]);
  useEffect(()=>{if(!scopedSessions.find(s=>s.id===activeId))setActiveId(scopedSessions.length?scopedSessions[scopedSessions.length-1].id:null);},[scopedSessions]);// eslint-disable-line
  const combos=useMemo(()=>{const map={};sessions.forEach(s=>{const key=`${s.sim}|${s.cls}|${s.track}|${s.type}`;(map[key]||={...s,runs:[]}).runs.push(s);});return Object.entries(map).map(([key,v])=>{const runs=v.runs.slice().sort((a,b)=>a.date.localeCompare(b.date));const bests=runs.map(r=>Math.min(...r.laps));const id=idealFor(v.track,v.cls,v.type);const bestEver=Math.min(...bests);const gap=id!=null?bestEver-id:null;const trend=bests.length>1?bests[bests.length-1]-bests[bests.length-2]:null;return{key,sim:v.sim,cls:v.cls,track:v.track,type:v.type,bests,bestEver,gap,trend,ideal:id,count:runs.length};});},[sessions]);

  const addSession=()=>{const laps=draftLaps.split(/[\s,]+/).map(Number).filter(n=>n>0);if(!laps.length)return;const id="u"+Date.now();setSessions(p=>[...p,{id,sim,cls,track,type,date:new Date().toISOString().slice(0,10),laps,notes:[{t:"Uploaded session",a:null}]}]);setActiveId(id);setDraftLaps("");setShowUpload(false);};
  const addNote=(text,agentTag)=>setSessions(p=>p.map(s=>s.id===activeId?{...s,notes:[...s.notes,{t:text,a:agentTag}]}:s));

  const runAgent=async()=>{
    if(!active)return;
    const rcConf=RUN_CLASSES.find(r=>r.id===runClass);
    const limit=userPlan[runClass];
    if(limit===0||(limit!==-1&&usage[runClass]>=limit))return;
    setRunning(true);setAgentPlan(null);setSuggestions({});setHeadline(null);setErr(null);
    const m=metrics(active.laps,ideal);
    const dataCtx=`Sim:${sim}|Class:${cls}|Track:${track}|Session:${active.type}(${active.date})\nLaps:${active.laps.join(",")}\nBest:${fmt(m.best)} Worst:${fmt(m.worst)} Avg:${fmt(m.mean)} Ideal:${fmt(ideal)}\nBest 3-lap:${fmt(m.s3)} Best 5-lap:${fmt(m.s5)}\nNotes:${active.notes.map(n=>n.t).join("/")||"none"}`;
    try{
      const rawPlan=await callClaude(`You are the Race Engineer orchestrator for ByteCraft Racing. Pick RELEVANT specialist agents. Available: aero,tire,powertrain,telemetry,strategy,environment. Engage AT MOST ${rcConf.maxAgents}. Return ONLY JSON: {"summary":"one line","agents":{"<id>":"<focus>"}}`,dataCtx);
      const p=parseJSON(rawPlan);
      const selected=Object.keys(p.agents).filter(id=>DOMAIN_AGENTS[id]);
      setAgentPlan({summary:p.summary,selected});
      await Promise.all(selected.map(async id=>{
        try{const out=await callClaude(DOMAIN_AGENTS[id].system,`${dataCtx}\nFocus:${p.agents[id]}`);const lines=out.split("\n").map(l=>l.replace(/^•\s*/,"").trim()).filter(Boolean);setSuggestions(s=>({...s,[id]:lines}));}
        catch{setSuggestions(s=>({...s,[id]:["Data unavailable."]}))}
      }));
      const h=await callClaude("You are the Synthesizer for ByteCraft Racing. In ONE sentence, state the single highest-priority focus for the driver's next session.",dataCtx);
      setHeadline(h.trim());
      setUsage(prev=>({...prev,[runClass]:(prev[runClass]||0)+1}));
    }catch(e){setErr(e.message);}
    setRunning(false);
  };

  const m=active?metrics(active.laps,ideal):null;
  const TABS=[["sessions","SESSIONS"],["engineer","RACE ENGINEER"],["progression","PROGRESSION"],["libraries","LIBRARIES"]];

  // ── Track Notes Reader (full-page replacement) ────────────────
  if(reader){
    return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{borderBottom:`1px solid ${C.line}`,padding:"13px 24px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <span onClick={()=>setReader(false)} style={{cursor:"pointer",fontSize:11,fontWeight:700,color:C.silver2,border:`1px solid ${C.line}`,borderRadius:6,padding:"6px 12px",letterSpacing:1}}>← BACK</span>
        <div><div style={{fontSize:12,fontWeight:900,letterSpacing:1,color:C.silver3}}>PUBLISHED TRACK NOTES</div><div style={{fontSize:9.5,color:C.textDim}}>{track} · {cls}</div></div>
        <span style={{marginLeft:"auto",fontSize:8,fontWeight:700,letterSpacing:1,color:C.silver2,border:`1px solid ${C.silver1}55`,borderRadius:4,padding:"3px 8px"}}>🔒 BYTECRAFT · READ-ONLY</span>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"200px 1fr",overflow:"hidden",minHeight:500}}>
        <div style={{borderRight:`1px solid ${C.line}`,overflowY:"auto",padding:"16px 14px"}}>
          <Label style={{marginBottom:10}}>CORNERS</Label>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {corners.map((c,i)=>{if(!c.published)return null;const sel=i===cornerSel;return(<div key={c.n} onClick={()=>setCornerSel(i)} style={{cursor:"pointer",background:sel?C.panel2:"transparent",border:`1px solid ${sel?C.pink:C.line}`,borderRadius:7,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:sel?C.pink:C.textDim,width:16,fontFamily:"monospace"}}>{c.n}</span>
              <span style={{fontSize:11,color:sel?C.silver3:C.silver2,flex:1}}>{c.name}</span>
            </div>);})}
          </div>
        </div>
        <div style={{overflowY:"auto",padding:"26px 30px"}}>
          {(()=>{const c=corners[cornerSel];if(!c||!c.published)return null;return(<div style={{maxWidth:640}}>
            <div style={{borderLeft:`3px solid ${C.pink}`,paddingLeft:14,marginBottom:22}}><div style={{fontSize:9,color:C.pink,letterSpacing:2.5,fontWeight:700}}>CORNER {String(c.n).padStart(2,"0")}</div><div style={{fontSize:26,fontWeight:900,color:C.silver3,marginTop:2}}>{c.name}</div></div>
            <Label style={{marginBottom:9}}>APPROACH</Label>
            <div style={{display:"flex",gap:10,marginBottom:22}}>{[["ENTRY SPEED",c.entry],["GEAR",c.gear]].map(([lab,v])=><div key={lab} style={{flex:1,background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:"12px 14px"}}><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>{lab}</div><div style={{fontSize:17,fontWeight:700,color:C.silver3,marginTop:3,fontFamily:"monospace"}}>{v}</div></div>)}</div>
            <Label style={{marginBottom:9}}>CAR POSITIONING</Label>
            <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:"4px 16px",marginBottom:22}}>{[["ENTRY",c.pos.entry],["APEX",c.pos.apex],["EXIT",c.pos.exit]].map(([lab,v],i)=><div key={lab} style={{display:"flex",gap:14,padding:"11px 0",borderBottom:i<2?`1px solid ${C.line}`:"none"}}><span style={{fontSize:8.5,color:C.pink,letterSpacing:1.5,fontWeight:700,width:44,flexShrink:0,paddingTop:2}}>{lab}</span><span style={{fontSize:13,color:C.text,lineHeight:1.5}}>{v}</span></div>)}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 150px",gap:16}}>
              <div><Label style={{marginBottom:9}}>RISKS &amp; NOTES</Label><div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:"13px 15px",fontSize:13,color:C.text,lineHeight:1.55}}>{c.risks}</div></div>
              <div><Label style={{marginBottom:9}}>TIRE LOAD</Label><div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>{["FL","FR","RL","RR"].map(k=><div key={k} style={{border:`1px solid ${C.line}`,borderRadius:6,padding:"7px 0",textAlign:"center"}}><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>{k}</div><div style={{fontSize:11,fontWeight:700,color:loadColor(c.load[k]),marginTop:2}}>{c.load[k]}</div></div>)}</div></div></div>
            </div>
          </div>);})()}
        </div>
      </div>
    </div>);
  }

  // ── Main driver layout ────────────────────────────────────────────
  return(<div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans','Helvetica Neue',sans-serif",color:C.text}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&family=JetBrains+Mono:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes pip{0%,100%{opacity:1}50%{opacity:.3}}@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fade .35s ease forwards}.mono{font-family:'JetBrains Mono',monospace}input,textarea,select{font-family:'DM Sans',sans-serif;outline:none}input:focus,textarea:focus,select:focus{border-color:${C.pink}!important}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#26262c}`}</style>

    <AppHeader user={user} onLogout={onLogout}/>

    {/* Quota bar */}
    <div style={{background:C.panel2,borderBottom:`1px solid ${C.line}`,padding:"8px 22px",display:"flex",alignItems:"center",gap:16}}>
      <PlanBadge plan={user.plan}/>
      <div style={{flex:1,display:"flex",gap:20}}>
        <div style={{flex:1}}><QBar label="QUICK" used={usage.quick||0} limit={userPlan.quick}/></div>
        <div style={{flex:1}}><QBar label="STANDARD" used={usage.standard||0} limit={userPlan.standard}/></div>
        <div style={{flex:1}}><QBar label="DEEP" used={usage.deep||0} limit={userPlan.deep}/></div>
      </div>
    </div>

    {/* Context bar */}
    <div style={{borderBottom:`1px solid ${C.line}`,padding:"10px 22px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",background:C.panel}}>
      {[{lab:"SIM",val:sim,setter:null,opts:["LeMans Ultimate"]},{lab:"CLASS",val:cls,setter:setCls,groups:CAR_GROUPS},{lab:"TRACK",val:track,setter:setTrack,groups:TRACK_GROUPS},{lab:"SESSION",val:type,setter:setType,opts:["Testing","Practice","Qualifying","Race"]}].map(({lab,val,setter,opts,groups})=>{
        const wide=lab==="CLASS"||lab==="TRACK";
        return(<div key={lab} style={{display:"flex",flexDirection:"column",gap:3,minWidth:wide?190:100}}>
          <span style={{fontSize:8,color:C.textDim,letterSpacing:1.5}}>{lab}</span>
          <select value={val} disabled={!setter} onChange={setter?e=>setter(e.target.value):undefined} style={{background:C.panel2,border:`1px solid ${C.line}`,borderRadius:6,padding:"5px 9px",color:setter?C.silver3:C.textDim,fontSize:11.5,maxWidth:240}}>
            {opts&&opts.map(o=><option key={o} style={{background:C.panel}}>{o}</option>)}
            {groups&&Object.entries(groups).map(([g,items])=><optgroup key={g} label={g} style={{background:C.panel}}>{items.map(o=><option key={o.v} value={o.v} style={{background:C.panel}}>{o.t}</option>)}</optgroup>)}
          </select>
        </div>);
      })}
    </div>

    {/* Tabs */}
    <div style={{display:"flex",gap:4,padding:"0 22px",borderBottom:`1px solid ${C.line}`}}>
      {TABS.map(([id,lab])=><div key={id} onClick={()=>setTab(id)} style={{cursor:"pointer",padding:"12px 14px",fontSize:10.5,fontWeight:700,letterSpacing:1.2,color:tab===id?C.pink:C.textDim,borderBottom:`2px solid ${tab===id?C.pink:"transparent"}`}}>{lab}</div>)}
    </div>

    <div style={{maxWidth:980,margin:"0 auto",padding:"24px 22px 60px"}}>

      {/* ── SESSIONS ── */}
      {tab==="sessions"&&(<div className="fade" style={{display:"grid",gridTemplateColumns:"230px 1fr",gap:18}}>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <Label>SESSIONS</Label>
            <span onClick={()=>setShowUpload(v=>!v)} style={{cursor:"pointer",fontSize:9,fontWeight:700,color:C.pink,border:`1px solid ${C.pinkBd}`,borderRadius:5,padding:"3px 8px",letterSpacing:1}}>+ UPLOAD</span>
          </div>
          {showUpload&&(<div className="fade" style={{background:C.panel,border:`1px solid ${C.pinkDim}`,borderRadius:8,padding:11,marginBottom:10}}>
            <div style={{fontSize:9,color:C.textDim,marginBottom:6}}>Demo: paste lap times (sec). Production: MoTeC <span className="mono">.ld / .ldx</span> ingest.</div>
            <textarea value={draftLaps} onChange={e=>setDraftLaps(e.target.value)} rows={2} placeholder="234.5, 232.8, 232.1, 231.9" style={{width:"100%",background:C.panel2,border:`1px solid ${C.line}`,borderRadius:6,padding:8,color:C.silver3,fontSize:11,resize:"vertical"}}/>
            <button onClick={addSession} style={{marginTop:7,width:"100%",background:"transparent",border:`1px solid ${C.pink}`,color:C.pink,borderRadius:6,padding:"7px",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>ADD TO {type.toUpperCase()}</button>
          </div>)}
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {scopedSessions.length===0&&<div style={{fontSize:11,color:C.textDim}}>No {type} sessions for this combo yet.</div>}
            {scopedSessions.slice().reverse().map(s=>{const act=s.id===activeId;return(<div key={s.id} onClick={()=>setActiveId(s.id)} style={{cursor:"pointer",background:act?C.panel2:C.panel,border:`1px solid ${act?C.pink:C.line}`,borderRadius:8,padding:"9px 11px"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,fontWeight:700,color:act?C.pink:C.silver3}}>{s.type}</span><span className="mono" style={{fontSize:9,color:C.textDim}}>{s.date}</span></div>
              <div className="mono" style={{fontSize:9.5,color:C.silver2,marginTop:3}}>{s.laps.length} laps · best {fmt(Math.min(...s.laps))}</div>
            </div>);})}
          </div>
        </div>
        <div>
          {active&&m?(<>
            <Label style={{marginBottom:10}}>SESSION DATA DISPLAY</Label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:9}}>
              {[[`IDEAL · ${active.type.toUpperCase()}`,m.ideal,C.gold],["BEST LAP",m.best,C.silver3],["AVERAGE",m.mean,C.silver2],["WORST LAP",m.worst,C.silver1]].map(([lab,v,col])=>(
                <div key={lab} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>{lab}</div><div className="mono" style={{fontSize:16,fontWeight:700,color:col,marginTop:3}}>{fmt(v)}</div></div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:20}}>
              {[["BEST 3-LAP AVG",m.s3],["BEST 5-LAP AVG",m.s5],["BEST 7-LAP AVG",m.s7],["BEST 10-LAP AVG",m.s10]].map(([lab,v])=>(
                <div key={lab} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,padding:"10px 12px",opacity:v==null?0.4:1}}><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>{lab}</div><div className="mono" style={{fontSize:14,fontWeight:700,color:v==null?C.textDim:C.pink,marginTop:3}}>{v==null?"n/a":fmt(v)}</div>{v==null&&<div style={{fontSize:7.5,color:C.textDim,marginTop:1}}>need {lab.match(/\d+/)[0]} laps</div>}</div>
              ))}
            </div>
            <Label style={{marginBottom:10}}>LAP-BY-LAP</Label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:22}}>
              {active.laps.map((l,i)=>{const isBest=l===m.best;return(<div key={i} style={{background:isBest?C.pinkDim:C.panel,border:`1px solid ${isBest?C.pink:C.line}`,borderRadius:6,padding:"6px 9px"}}><div style={{fontSize:7.5,color:C.textDim}}>L{i+1}</div><div className="mono" style={{fontSize:11,color:isBest?C.pink:C.silver2,fontWeight:isBest?700:400}}>{fmt(l)}</div></div>);})}
            </div>
            <Label style={{marginBottom:10}}>SESSION NOTES</Label>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              {active.notes.length===0&&<div style={{fontSize:11,color:C.textDim}}>No notes yet.</div>}
              {active.notes.map((n,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",background:C.panel,border:`1px solid ${C.line}`,borderRadius:7,padding:"8px 11px"}}>{n.a&&<span style={{fontSize:7.5,fontWeight:700,letterSpacing:1,color:C.pink,border:`1px solid ${C.pinkDim}`,borderRadius:4,padding:"1px 5px",flexShrink:0,marginTop:1}}>{n.a}</span>}<span style={{fontSize:11.5,color:n.a?C.silver2:C.text,lineHeight:1.5}}>{n.t}</span></div>)}
            </div>
            <NoteAdder onAdd={t=>addNote(t,null)}/>
          </>):<div style={{fontSize:12,color:C.textDim}}>Select or upload a session.</div>}
        </div>
      </div>)}

      {/* ── RACE ENGINEER ── */}
      {tab==="engineer"&&(<div className="fade">
        <Label style={{marginBottom:10}}>SELECT RUN CLASS</Label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
          {RUN_CLASSES.map(rc=>{
            const limit=userPlan[rc.id];
            const gated=limit===0;
            const over=!gated&&limit!==-1&&(usage[rc.id]||0)>=limit;
            const sel=runClass===rc.id;
            return(<div key={rc.id} onClick={()=>!gated&&setRunClass(rc.id)} style={{background:C.panel,border:`1px solid ${sel?rc.color:C.line}`,borderRadius:10,padding:"14px",cursor:gated?"not-allowed":"pointer",opacity:gated?0.5:1}}>
              <div style={{fontSize:12,fontWeight:700,color:gated?C.textDim:rc.color,marginBottom:3}}>{rc.label}</div>
              <div style={{fontSize:10,color:C.textDim,marginBottom:8}}>{rc.desc}</div>
              <div className="mono" style={{fontSize:10,color:C.textDim,marginBottom:10}}>{rc.cost}</div>
              <div style={{fontSize:9,color:gated?C.danger:over?C.gold:C.textDim}}>
                {gated?"Not on this plan":over?`Allowance used (${usage[rc.id]}/${limit})`:limit===-1?"Unlimited":`${usage[rc.id]||0} / ${limit} used`}
              </div>
            </div>);
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><Label>SESSION REVIEW</Label><div style={{fontSize:12,color:C.textDim,marginTop:4}}>{active?`${active.type} · ${active.date} · ${active.laps.length} laps`:"No session selected"}</div></div>
          <button onClick={runAgent} disabled={running||!active||userPlan[runClass]===0||(userPlan[runClass]!==-1&&(usage[runClass]||0)>=userPlan[runClass])} style={{background:"transparent",border:`1px solid ${C.pink}`,color:C.pink,borderRadius:7,padding:"9px 22px",fontSize:10.5,fontWeight:700,letterSpacing:1.5,cursor:"pointer",opacity:(running||!active||userPlan[runClass]===0||(userPlan[runClass]!==-1&&(usage[runClass]||0)>=userPlan[runClass]))?0.4:1}}>
            {running?"REVIEWING…":"REVIEW SESSION ↗"}
          </button>
        </div>
        {agentPlan&&(<div style={{background:C.panel,border:`1px solid ${C.pinkDim}`,borderRadius:9,padding:"12px 15px",marginBottom:14}}><Label color={C.pink}>RACE ENGINEER</Label><div style={{fontSize:12.5,color:C.text,marginTop:4}}>{agentPlan.summary}</div></div>)}
        {agentPlan&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {agentPlan.selected.map(id=><div key={id} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:13}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}><span style={{width:6,height:6,borderRadius:"50%",background:suggestions[id]?C.silver2:C.pink,animation:suggestions[id]?"none":"pip 1s infinite"}}/><span style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:C.silver3}}>{DOMAIN_AGENTS[id].label}</span></div>
            {suggestions[id]?suggestions[id].map((line,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}><span style={{flex:1,fontSize:11.5,color:C.text,lineHeight:1.45}}>{line}</span><span onClick={()=>addNote(line,DOMAIN_AGENTS[id].tag)} style={{cursor:"pointer",flexShrink:0,fontSize:8,fontWeight:700,color:C.textDim,border:`1px solid ${C.line}`,borderRadius:4,padding:"2px 6px",letterSpacing:.5}}>+ NOTE</span></div>):<div style={{fontSize:10,color:C.textDim,fontStyle:"italic"}}>Analysing…</div>}
          </div>)}
        </div>)}
        {headline&&(<div style={{background:C.panel2,border:`1px solid ${C.pink}`,borderRadius:9,padding:"14px 16px"}}><Label>NEXT-SESSION PRIORITY</Label><div style={{fontSize:14,color:C.silver3,marginTop:5,lineHeight:1.4}}>{headline}</div></div>)}
        {err&&<div style={{marginTop:12,color:"#FF8888",fontSize:12}}>⚠ {err}</div>}
        {!agentPlan&&!running&&<div style={{fontSize:11.5,color:C.textDim,marginTop:8}}>Select a run class and session, then engage the Race Engineer. Agent suggestions can be tagged directly into session notes via <b style={{color:C.silver2}}>+ NOTE</b>.</div>}
      </div>)}

      {/* ── PROGRESSION ── */}
      {tab==="progression"&&(<div className="fade">
        <Label style={{marginBottom:4}}>PROGRESSION TRACKER</Label>
        <div style={{fontSize:11.5,color:C.textDim,marginBottom:16}}>Sim × Class × Track × Session — gap to ideal & trend.</div>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:"13px 16px",marginBottom:18}}>
          <Label>TIER THRESHOLDS · GAP TO IDEAL (SECONDS)</Label>
          <div style={{display:"flex",gap:16,marginTop:11,flexWrap:"wrap",alignItems:"flex-end"}}>
            {[["ELITE ≤","elite",C.gold],["COMPETITIVE ≤","competitive",C.silver3],["DEVELOPING ≤","developing",C.pink]].map(([lab,key,col])=>(
              <div key={key} style={{display:"flex",flexDirection:"column",gap:5}}><span style={{fontSize:8,color:col,letterSpacing:1,fontWeight:700}}>{lab}</span><input type="number" step="0.1" min="0" value={tiers[key]} className="mono" onChange={e=>setTiers(p=>({...p,[key]:Math.max(0,Number(e.target.value)||0)}))} style={{width:80,background:C.panel2,border:`1px solid ${C.line}`,borderRadius:6,padding:"6px 9px",color:C.silver3,fontSize:12}}/></div>
            ))}
            <div style={{display:"flex",flexDirection:"column",gap:5}}><span style={{fontSize:8,color:C.silver1,letterSpacing:1,fontWeight:700}}>BEYOND →</span><span style={{fontSize:11,color:C.silver1,padding:"6px 0"}}>FOUNDATION</span></div>
          </div>
          <div style={{fontSize:9,color:C.textDim,marginTop:9,fontStyle:"italic"}}>Set per class. Gap bar fills relative to the Developing cutoff.</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {combos.map(c=>{const tier=tierFor(c.gap,tiers);const gapPct=c.gap!=null?Math.max(0,Math.min(100,100-(c.gap/tiers.developing)*100)):0;return(<div key={c.key} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:11}}>
              <div><div style={{fontSize:13,fontWeight:700,color:C.silver3}}>{c.track} · {c.type}</div><div style={{fontSize:10,color:C.textDim,marginTop:1}}>{c.cls} · {c.count} session{c.count>1?"s":""}</div></div>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:tier.color,border:`1px solid ${tier.color}55`,borderRadius:5,padding:"3px 9px"}}>{tier.name}</span>
            </div>
            <div style={{display:"flex",gap:22,alignItems:"center",marginBottom:11}}>
              <div><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>IDEAL</div><div className="mono" style={{fontSize:14,color:C.gold}}>{fmt(c.ideal)}</div></div>
              <div><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>YOUR BEST</div><div className="mono" style={{fontSize:14,color:C.silver3}}>{fmt(c.bestEver)}</div></div>
              <div><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>GAP</div><div className="mono" style={{fontSize:14,color:c.gap<=1.5?C.good:C.pink}}>{c.gap!=null?`+${c.gap.toFixed(3)}s`:"—"}</div></div>
              <div><div style={{fontSize:8,color:C.textDim,letterSpacing:1}}>LAST TREND</div><div className="mono" style={{fontSize:14,color:c.trend==null?C.textDim:c.trend<0?C.good:C.risk}}>{c.trend==null?"—":`${c.trend<0?"▼":"▲"} ${Math.abs(c.trend).toFixed(3)}s`}</div></div>
            </div>
            <div style={{fontSize:8,color:C.textDim,letterSpacing:1.5,fontWeight:700,marginBottom:5}}>CLOSENESS</div>
            <div style={{height:6,background:C.line,borderRadius:3,overflow:"hidden",marginBottom:c.bests.length>1?0:0}}><div style={{width:`${gapPct}%`,height:"100%",background:`linear-gradient(90deg,${C.pink},${C.gold})`,transition:"width .4s"}}/></div>
            {c.bests.length>1&&(<><div style={{fontSize:8,color:C.textDim,letterSpacing:1.5,fontWeight:700,marginTop:12,marginBottom:5}}>TREND</div><div style={{display:"flex",alignItems:"flex-end",gap:4,height:34}}>{c.bests.map((b,i)=>{const lo=Math.min(...c.bests,c.ideal),hi=Math.max(...c.bests);const h=hi===lo?100:25+((hi-b)/(hi-lo))*75;return <div key={i} title={fmt(b)} style={{flex:1,height:`${h}%`,background:i===c.bests.length-1?C.pink:C.silver1,borderRadius:2}}/>;})}</div></>)}
          </div>);})}
        </div>
      </div>)}

      {/* ── LIBRARIES ── */}
      {tab==="libraries"&&(<div className="fade">
        <Label style={{marginBottom:4}}>KNOWLEDGE LIBRARIES</Label>
        <div style={{fontSize:11.5,color:C.textDim,marginBottom:18}}>Scoped to the selected Sim × Class × Track. ByteCraft libraries are read-only references.</div>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:16,marginBottom:11}}>
          <div style={{fontSize:12,fontWeight:700,color:C.silver3,marginBottom:12}}>Track Notes</div>
          <LibRow title="Published guide" sub={`ByteCraft corner dossiers for ${track}`} kind="bytecraft" onView={pubCount>0?()=>{const first=corners.findIndex(c=>c.published);setCornerSel(first>=0?first:0);setReader(true);}:undefined}/>
          <LibRow title="Your notes" sub="Written on the ByteCraft template" kind="user" last note={`${comboSessions.reduce((a,s)=>a+s.notes.length,0)} note entries`}/>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:16,marginBottom:11}}><LibRow title="Ideal Session Data" sub="Reference targets per session type — viewable on the session dashboard" kind="bytecraft" last bare note={idealTypes.length?`Targets set: ${idealTypes.join(", ")}`:"No targets for this combination yet"}/></div>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:16,marginBottom:11}}><LibRow title="User Session History" sub="Your historical landscape — compounds per session" kind="user" last bare note={`${comboSessions.length} session${comboSessions.length===1?"":"s"} logged for this combo`}/></div>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:16}}><LibRow title="Vehicle Dynamics" sub="ByteCraft published theoretical frameworks (global)" kind="bytecraft" last bare/></div>
      </div>)}

    </div>
  </div>);
}

// ── GARAGE ADMIN DASHBOARD ─────────────────────────────────────────
function GarageAdminDash({user,onLogout}){
  const [tab,setTab]=useState("TEAM");
  const [members,setMembers]=useState(TEAM);
  const [showInvite,setShowInvite]=useState(false);
  const [invEmail,setInvEmail]=useState("");
  const active=members.filter(m=>m.status==="active").length;
  const totalStd=members.reduce((s,m)=>s+m.std,0),totalDeep=members.reduce((s,m)=>s+m.deep,0);
  return(<div style={{minHeight:"100vh",background:C.bg}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700;9..40,900&display=swap');*{box-sizing:border-box;margin:0;padding:0}input,textarea{font-family:'DM Sans',sans-serif;outline:none}`}</style>
    <AppHeader user={user} onLogout={onLogout} sub={`Garage admin · ${user.garage}`}/>
    <div style={{background:C.pinkBg,borderBottom:`1px solid ${C.pinkBd}`,padding:"6px 22px",fontSize:10,color:C.pink}}>⚑ Garage admin scope — your team only. System-wide data and library management require product admin access.</div>
    <div style={{display:"flex",borderBottom:`1px solid ${C.line}`,padding:"0 22px"}}>
      {["TEAM","QUOTA","BILLING","SETTINGS"].map(t=><div key={t} onClick={()=>setTab(t)} style={{padding:"11px 14px",fontSize:10,fontWeight:700,letterSpacing:1.2,color:tab===t?C.pink:C.textDim,borderBottom:`2px solid ${tab===t?C.pink:"transparent"}`,cursor:"pointer"}}>{t}</div>)}
    </div>
    <div style={{padding:"22px",maxWidth:900,margin:"0 auto"}}>
      {tab==="TEAM"&&(<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:20}}>
          {[{l:"ACTIVE MEMBERS",v:active,of:members.length},{l:"SEATS USED",v:members.length,of:50},{l:"SESSIONS (MO)",v:members.reduce((s,m)=>s+m.sessions,0)},{l:"PENDING",v:members.filter(m=>m.status==="pending").length}].map(s=><div key={s.l} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,padding:"12px 14px"}}><div style={{fontSize:9,color:C.textDim,letterSpacing:1.5,marginBottom:4}}>{s.l}</div><div style={{fontSize:20,fontWeight:900,color:C.silver3}}>{s.v}{s.of!=null&&<span style={{fontSize:12,color:C.textDim}}> / {s.of}</span>}</div></div>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <Label>TEAM MEMBERS</Label>
          <button onClick={()=>setShowInvite(v=>!v)} style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.pink,background:C.pinkBg,border:`1px solid ${C.pinkBd}`,borderRadius:6,padding:"6px 14px",cursor:"pointer"}}>+ INVITE MEMBER</button>
        </div>
        {showInvite&&(<div style={{background:C.panel,border:`1px solid ${C.pinkBd}`,borderRadius:8,padding:"12px 14px",marginBottom:12,display:"flex",gap:8}}>
          <input value={invEmail} onChange={e=>setInvEmail(e.target.value)} placeholder="teammate@example.com" style={{flex:1,background:C.panel2,border:`1px solid ${C.line}`,borderRadius:6,padding:"8px 11px",color:C.silver3,fontSize:12}}/>
          <button onClick={()=>{setInvEmail("");setShowInvite(false);}} style={{fontSize:11,fontWeight:700,padding:"8px 15px",background:C.pink,color:"#fff",border:"none",borderRadius:6,cursor:"pointer"}}>SEND</button>
          <button onClick={()=>setShowInvite(false)} style={{fontSize:11,color:C.textDim,background:"transparent",border:`1px solid ${C.line}`,borderRadius:6,padding:"8px 12px",cursor:"pointer"}}>CANCEL</button>
        </div>)}
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 65px 58px 76px 58px 65px",padding:"8px 15px",borderBottom:`1px solid ${C.line}`,fontSize:8,color:C.textDim,fontWeight:700,letterSpacing:1.5}}>
            <span>MEMBER</span><span style={{textAlign:"center"}}>SESSIONS</span><span style={{textAlign:"center"}}>QUICK</span><span style={{textAlign:"center"}}>STANDARD</span><span style={{textAlign:"center"}}>DEEP</span><span/>
          </div>
          {members.map((m,i)=><div key={m.id} style={{display:"grid",gridTemplateColumns:"1fr 65px 58px 76px 58px 65px",padding:"10px 15px",borderBottom:i<members.length-1?`1px solid ${C.line}`:"none",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><Av i={m.av} s={28}/><div><div style={{fontSize:12,fontWeight:700,color:C.silver3}}>{m.name}</div><div style={{fontSize:10,color:C.textDim}}>{m.email}</div></div><StatusDot status={m.status}/></div>
            <div style={{textAlign:"center",fontSize:12,color:m.status==="pending"?C.textDim:C.silver3}}>{m.sessions}</div>
            <div style={{textAlign:"center",fontSize:12,fontFamily:"monospace",color:C.silver2}}>{m.quick}</div>
            <div style={{textAlign:"center",fontSize:12,fontFamily:"monospace",color:C.silver2}}>{m.std}</div>
            <div style={{textAlign:"center",fontSize:12,fontFamily:"monospace",color:C.silver2}}>{m.deep}</div>
            <div style={{textAlign:"right"}}><button onClick={()=>setMembers(ms=>ms.filter(x=>x.id!==m.id))} style={{fontSize:10,color:C.danger,background:"transparent",border:"none",cursor:"pointer"}}>Remove</button></div>
          </div>)}
        </div>
      </div>)}
      {tab==="QUOTA"&&(<div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:"18px"}}>
        <Label style={{marginBottom:4}}>POOLED MONTHLY ALLOWANCE</Label>
        <div style={{fontSize:11,color:C.textDim,marginBottom:16}}>Usage is shared across all team members. No per-seat limits.</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <QBar label="QUICK" used={members.reduce((s,m)=>s+m.quick,0)} limit={-1}/>
          <QBar label="STANDARD" used={totalStd} limit={45}/>
          <QBar label="DEEP" used={totalDeep} limit={9}/>
        </div>
        <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.line}`,fontSize:10,color:C.textDim}}>Standard credits: $9.99 for 25 · Deep credits: $11.99 for 10</div>
      </div>)}
      {tab==="BILLING"&&<div style={{padding:"48px 0",textAlign:"center",color:C.textDim,fontSize:12}}>Billing history and payment method</div>}
      {tab==="SETTINGS"&&<div style={{padding:"48px 0",textAlign:"center",color:C.textDim,fontSize:12}}>Garage settings — name, domain restrictions, member permissions</div>}
    </div>
  </div>);
}

// ── PRODUCT ADMIN DASHBOARD ────────────────────────────────────────
function ProductAdminDash({user,onLogout}){
  const [tab,setTab]=useState("OVERVIEW");
  const [auditStatus,setAuditStatus]=useState("idle");
  const [auditFindings,setAuditFindings]=useState(null);
  const [auditErr,setAuditErr]=useState(null);
  const totalUsers=SOLOS_DATA.length+GARAGES_DATA.reduce((s,g)=>s+g.members,0);
  const totalSessions=GARAGES_DATA.reduce((s,g)=>s+g.sessions,0)+SOLOS_DATA.reduce((s,u)=>s+u.sessions,0);
  const mrr=GARAGES_DATA.reduce((s,g)=>s+g.mrr,0)+SOLOS_DATA.reduce((s,u)=>s+(u.plan==="engineer"?19:u.plan==="driver"?9:0),0);

  const runAudit=async()=>{
    setAuditStatus("running");setAuditFindings(null);setAuditErr(null);
    const cleanAgileCtx=`SOURCE: Clean Agile: Back to Basics (Robert C. Martin) — extracted from project PDF\nTDD Three rules: (1) No production code without failing test. (2) No more test code than needed to fail. (3) No more production code than needed to pass.\n"The ultimate goal of TDD is courage, not coverage."\nREFACTORING: improving structure without changing behaviour — ongoing, not scheduled.\nSIMPLE DESIGN (Kent Beck 4 rules): Pass tests · Reveal intent · Remove duplication · Decrease elements.\nCRAFTSMANSHIP: "Not only working software, but also well-crafted software."`;
    const cleanCodeCtx=`SOURCE: Clean Code (Robert C. Martin) — canonical principles\nMEANINGFUL NAMES: intention-revealing, no noise words.\nFUNCTIONS: small, do one thing, one level of abstraction, no side effects, DRY.\nERROR HANDLING: use exceptions, don't return null.\nCLASSES: Single Responsibility, Open/Closed, organise for change.`;
    const cleanArchCtx=`SOURCE: Clean Architecture (Robert C. Martin) — canonical principles\nDEPENDENCY RULE: dependencies point inward toward higher-level policies.\nSOLID: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.\nSCREAMING ARCHITECTURE: architecture screams the application's intent, not the framework's.\nBOUNDARIES: UI, DB, frameworks are details at the edges.`;
    const codebaseSummary=`CODEBASE: ByteCraft Racing Race Engineering Agent v12 (merged).\nReact 18 JSX, single-file ~900 lines. Role-based auth routing (login→driver/garage-admin/product-admin).\nDriverApp has Sessions, Race Engineer (run class gating), Progression, Libraries tabs.\nRun classes (Quick/Standard/Deep) enforce cost model — Haiku specialists, Sonnet orchestrator, Opus for Deep only.\nGarageAdminDash: team management, pooled quota. ProductAdminDash: system-wide view + Code Craft.\nCode Craft moved from driver view to product admin — correct SRP boundary.\nKnown issues: single-file structure, inline styles repeated, no tests, client-side role gating only.`;
    try{
      const raw=await callClaude(`You are Code Craft — internal code-review sub-agent for ByteCraft Racing. Review the codebase against the three provided sources. Surface real smells. Return ONLY a JSON array of 5-6 findings, no markdown: [{"area":"2-3 words","severity":"ok|minor|major","book":"Clean Agile|Clean Code|Clean Architecture","principle":"principle name","note":"one honest sentence","fix":"one concrete suggestion","source":"section reference"}]`,`${cleanAgileCtx}\n\n${cleanCodeCtx}\n\n${cleanArchCtx}\n\nCODEBASE:\n${codebaseSummary}`,1200);
      setAuditFindings(parseJSON(raw));setAuditStatus("done");
    }catch(e){setAuditErr(e.message);setAuditStatus("error");}
  };

  return(<div style={{minHeight:"100vh",background:C.bg}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700;9..40,900&family=JetBrains+Mono:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{font-family:'DM Sans',sans-serif;outline:none}@keyframes pip{0%,100%{opacity:1}50%{opacity:.3}}.mono{font-family:'JetBrains Mono',monospace}`}</style>
    <AppHeader user={user} onLogout={onLogout} accent={C.orange} sub="Platform admin · Axiom Black LLC"/>
    <div style={{background:C.oBg,borderBottom:`1px solid ${C.oBd}`,padding:"6px 22px",fontSize:10,color:C.orange}}>⬡ Product admin — full platform access. Garage admins and drivers cannot see this view.</div>
    <div style={{display:"flex",borderBottom:`1px solid ${C.line}`,padding:"0 22px",overflowX:"auto"}}>
      {["OVERVIEW","GARAGES","USERS","LIBRARIES","CODE CRAFT","USAGE"].map(t=><div key={t} onClick={()=>setTab(t)} style={{padding:"11px 14px",fontSize:10,fontWeight:700,letterSpacing:1.2,color:tab===t?C.orange:C.textDim,borderBottom:`2px solid ${tab===t?C.orange:"transparent"}`,cursor:"pointer",whiteSpace:"nowrap"}}>{t}</div>)}
    </div>
    <div style={{padding:"22px",maxWidth:960,margin:"0 auto"}}>

      {tab==="OVERVIEW"&&(<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:22}}>
          {[{l:"TOTAL USERS",v:totalUsers},{l:"GARAGE ACCOUNTS",v:GARAGES_DATA.length},{l:"TOTAL SESSIONS",v:totalSessions},{l:"MRR",v:`$${mrr.toLocaleString()}`}].map(s=><div key={s.l} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,padding:"12px 14px"}}><div style={{fontSize:9,color:C.textDim,letterSpacing:1.5,marginBottom:4}}>{s.l}</div><div style={{fontSize:21,fontWeight:900,color:C.silver3}}>{s.v}</div></div>)}
        </div>
        <Label style={{marginBottom:12}}>GARAGE ACCOUNTS</Label>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden",marginBottom:22}}>
          {GARAGES_DATA.map((g,i)=><div key={g.id} style={{padding:"11px 15px",borderBottom:i<GARAGES_DATA.length-1?`1px solid ${C.line}`:"none",display:"flex",alignItems:"center",gap:12}}>
            <Av i={g.name.slice(0,2).toUpperCase()} s={30} bg={C.oBg} col={C.orange}/>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:C.silver3}}>{g.name}</div><div style={{fontSize:10,color:C.textDim}}>Admin: {g.admin} · {g.members} members · {g.sessions} sessions</div></div>
            <PlanBadge plan={g.plan}/>
            <div style={{fontSize:12,fontWeight:700,color:C.orange,width:64,textAlign:"right"}}>${g.mrr}/mo</div>
          </div>)}
        </div>
        <Label style={{marginBottom:12}}>SOLO DRIVERS</Label>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden"}}>
          {SOLOS_DATA.map((u,i)=><div key={u.id} style={{padding:"10px 15px",borderBottom:i<SOLOS_DATA.length-1?`1px solid ${C.line}`:"none",display:"flex",alignItems:"center",gap:10}}>
            <Av i={u.name.slice(0,2)} s={28}/><div style={{flex:1,fontSize:12,fontWeight:700,color:C.silver3}}>{u.name}</div><PlanBadge plan={u.plan}/><div style={{fontSize:10,color:C.textDim,width:72}}>{u.sessions} sessions</div><div style={{fontSize:10,color:C.textDim,width:82}}>{u.last}</div>
          </div>)}
        </div>
      </div>)}

      {tab==="GARAGES"&&(<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><Label>ALL GARAGE ACCOUNTS ({GARAGES_DATA.length})</Label><button style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.orange,background:C.oBg,border:`1px solid ${C.oBd}`,borderRadius:6,padding:"6px 14px",cursor:"pointer"}}>+ CREATE GARAGE</button></div>
        {GARAGES_DATA.map(g=><div key={g.id} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:"14px 16px",marginBottom:9,display:"flex",alignItems:"center",gap:14}}>
          <Av i={g.name.slice(0,2).toUpperCase()} s={38} bg={C.oBg} col={C.orange}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:C.silver3}}>{g.name}</div><div style={{fontSize:10,color:C.textDim}}>Admin: {g.admin} · {g.members} seats · {g.sessions} sessions</div></div>
          <PlanBadge plan={g.plan}/>
          <div style={{fontSize:13,fontWeight:700,color:C.orange}}>${g.mrr}/mo</div>
          <button style={{fontSize:11,color:C.danger,background:"transparent",border:`1px solid ${C.danger}44`,borderRadius:5,padding:"5px 10px",cursor:"pointer"}}>Suspend</button>
        </div>)}
      </div>)}

      {tab==="USERS"&&(<div>
        <Label style={{marginBottom:12}}>SOLO DRIVERS ({SOLOS_DATA.length})</Label>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden",marginBottom:20}}>
          {SOLOS_DATA.map((u,i)=><div key={u.id} style={{padding:"10px 15px",borderBottom:i<SOLOS_DATA.length-1?`1px solid ${C.line}`:"none",display:"flex",alignItems:"center",gap:10}}>
            <Av i={u.name.slice(0,2)} s={30}/><div style={{flex:1,fontSize:12,fontWeight:700,color:C.silver3}}>{u.name}</div><PlanBadge plan={u.plan}/><div style={{fontSize:10,color:C.textDim,width:72}}>{u.sessions} sessions</div><div style={{fontSize:10,color:C.textDim,width:82}}>{u.last}</div><button style={{fontSize:11,color:C.danger,background:"transparent",border:`1px solid ${C.danger}44`,borderRadius:5,padding:"5px 10px",cursor:"pointer"}}>Suspend</button>
          </div>)}
        </div>
        <Label style={{marginBottom:8}}>GARAGE MEMBERS</Label>
        <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:"13px 15px",fontSize:12,color:C.textDim}}>{GARAGES_DATA.reduce((s,g)=>s+g.members,0)} members across {GARAGES_DATA.length} garages. Drill in via the Garages tab.</div>
      </div>)}

      {tab==="LIBRARIES"&&(<div>
        <div style={{padding:"10px 14px",background:C.oBg,border:`1px solid ${C.oBd}`,borderRadius:8,fontSize:10,color:C.orange,marginBottom:18}}>⬡ Admin-controlled. Drivers see published content read-only. Garage admins have no access to this panel.</div>
        {[{name:"Published Track Notes",desc:"Corner dossiers per track and car class",status:"8 of 11 corners published — Circuit de la Sarthe",action:"Manage dossiers"},{name:"Ideal Session Data",desc:"Reference targets per scenario",status:"Targets set: Testing, Practice, Qualifying, Race",action:"Update targets"},{name:"Vehicle Dynamics",desc:"Theoretical frameworks — global, all users",status:"Core frameworks published",action:"Manage frameworks"}].map(lib=><div key={lib.name} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.orange,flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:C.silver3,marginBottom:2}}>{lib.name}</div><div style={{fontSize:10,color:C.textDim}}>{lib.desc}</div><div style={{fontSize:10,color:C.orange,marginTop:3}}>{lib.status}</div></div>
          <button style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.orange,background:C.oBg,border:`1px solid ${C.oBd}`,borderRadius:6,padding:"7px 13px",cursor:"pointer"}}>{lib.action}</button>
        </div>)}
      </div>)}

      {tab==="CODE CRAFT"&&(<div>
        <Label style={{marginBottom:4}}>CODE CRAFT · INTERNAL CODE REVIEW</Label>
        <div style={{fontSize:11.5,color:C.textDim,marginBottom:16,lineHeight:1.5}}>Internal sub-agent that audits the Race Engineering Agent codebase against the three Robert C. Martin standards. Never surfaced to drivers or garage admins.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
          {STANDARDS.map(s=><div key={s.book} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:13}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:C.silver3,lineHeight:1.3}}>{s.book}</div><span style={{fontSize:7,fontWeight:700,letterSpacing:1,color:s.pdf?C.good:C.silver1,border:`1px solid ${(s.pdf?C.good:C.silver1)}55`,borderRadius:3,padding:"2px 5px",flexShrink:0}}>{s.pdf?"PDF ✓":"PRINCIPLES"}</span></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{s.tags.map(t=><span key={t} style={{fontSize:8,color:C.silver1,border:`1px solid ${C.line}`,borderRadius:4,padding:"2px 6px"}}>{t}</span>)}</div>
          </div>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <Label>CRAFTSMANSHIP AUDIT</Label>
          <button onClick={runAudit} disabled={auditStatus==="running"} style={{background:"transparent",border:`1px solid ${C.pink}`,color:C.pink,borderRadius:7,padding:"8px 20px",fontSize:10.5,fontWeight:700,letterSpacing:1.5,cursor:"pointer",opacity:auditStatus==="running"?0.5:1}}>
            {auditStatus==="running"?"AUDITING…":"RUN CODE CRAFT AUDIT ↗"}
          </button>
        </div>
        {auditFindings&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
          {auditFindings.map((f,i)=>{const sc=f.severity==="major"?C.pink:f.severity==="minor"?C.gold:C.good;return(<div key={i} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:13}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{width:6,height:6,borderRadius:"50%",background:sc}}/><span style={{fontSize:10.5,fontWeight:700,color:C.silver3}}>{f.area}</span><span style={{marginLeft:"auto",fontSize:7.5,fontWeight:700,letterSpacing:1,color:sc,textTransform:"uppercase"}}>{f.severity}</span></div>
            <div style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:6}}>{f.note}</div>
            <div style={{fontSize:10.5,color:C.silver2,lineHeight:1.45,marginBottom:6}}><span style={{color:C.pink}}>Fix:</span> {f.fix}</div>
            <div style={{fontSize:8,color:C.textDim,letterSpacing:.5}}>{f.book} · {f.principle}</div>
            {f.source&&<div style={{fontSize:8,color:"#444",letterSpacing:.3,marginTop:3,fontStyle:"italic"}}>Source: {f.source}</div>}
          </div>);})}
        </div>)}
        {auditErr&&<div style={{color:"#FF8888",fontSize:12,marginBottom:20}}>⚠ {auditErr}</div>}
        {!auditFindings&&auditStatus!=="running"&&<div style={{fontSize:11,color:C.textDim,marginBottom:22,fontStyle:"italic"}}>Run an audit to have Code Craft review the codebase against the three standards above.</div>}
        <Label style={{marginBottom:4}}>REVISION LOG</Label>
        <div style={{fontSize:10.5,color:C.textDim,marginBottom:12}}>What changed, why, when, and the standard it answers to.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {REVISION_LOG.slice().reverse().map((r,i)=><div key={i} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:"12px 15px",display:"grid",gridTemplateColumns:"64px 1fr 200px",gap:14,alignItems:"start"}}>
            <div><div className="mono" style={{fontSize:12,fontWeight:700,color:C.pink}}>{r.ver}</div><div className="mono" style={{fontSize:8.5,color:C.textDim,marginTop:2}}>{r.date}</div><span style={{display:"inline-block",marginTop:6,fontSize:7,fontWeight:700,letterSpacing:.5,color:r.trigger==="Routine"?C.silver1:C.gold,border:`1px solid ${(r.trigger==="Routine"?C.silver1:C.gold)}55`,borderRadius:3,padding:"1px 5px"}}>{r.trigger==="Routine"?"ROUTINE":"ADMIN DEV"}</span></div>
            <div><div style={{fontSize:12,color:C.silver3,lineHeight:1.45}}>{r.change}</div><div style={{fontSize:10.5,color:C.textDim,marginTop:4}}><span style={{color:C.silver1}}>Why:</span> {r.why}</div></div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}><span style={{fontSize:8.5,color:C.silver2,lineHeight:1.4}}>{r.std}</span><span style={{fontSize:7.5,fontWeight:700,letterSpacing:1,color:C.good,border:`1px solid ${C.good}55`,borderRadius:4,padding:"1px 6px"}}>PASS</span></div>
          </div>)}
        </div>
      </div>)}

      {tab==="USAGE"&&<div style={{padding:"48px 0",textAlign:"center",color:C.textDim,fontSize:12}}>System-wide token usage, run cost monitoring, and billing analytics</div>}
    </div>
  </div>);
}

// ── APP ROOT ───────────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState("login");
  const [user,setUser]=useState(null);
  const login=key=>{const u=DEMO[key];setUser(u);setScreen(key==="driver"?"driver":key==="garageAdmin"?"garage":"admin");};
  const signup=u=>{setUser(u);setScreen("driver");};
  const logout=()=>{setUser(null);setScreen("login");};
  return(<div>
    {screen==="login"  &&<LoginScreen onLogin={login} onSignup={()=>setScreen("signup")}/>}
    {screen==="signup" &&<SignupScreen onBack={()=>setScreen("login")} onComplete={signup}/>}
    {screen==="driver" &&user&&<DriverApp user={user} onLogout={logout}/>}
    {screen==="garage" &&user&&<GarageAdminDash user={user} onLogout={logout}/>}
    {screen==="admin"  &&user&&<ProductAdminDash user={user} onLogout={logout}/>}
  </div>);
}
