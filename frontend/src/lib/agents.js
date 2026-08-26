// ByteCraft Racing — the ten-agent roster, and what each one needs.
//
// WHY THIS EXISTS IN A PHASE WHERE THE AGENT IS DARK.
//
// CLAUDE.md keeps the agent dark in the pilot, and the standing bar against
// faked capability rules out a workspace that pretends to produce a debrief.
// The prototype's Engineering Run answered that by rendering "— TBD" in every
// box, which is honest and worth nothing to a driver.
//
// There is a real question this layer can answer today, though, and it is one
// only we can answer: DOES THIS DRIVER'S EXPORT ACTUALLY CARRY WHAT EACH AGENT
// WILL NEED? LMU ships GTE cars with Tyre Load, Grip Fract and Battery Charge
// permanently empty, and any given session can log a channel as all-zero. A
// driver who finds that out when the agent launches has wasted a season of
// uploads. A driver who finds it out now can change what they export.
//
// So the roster carries each agent's INPUT CHANNELS, named exactly as the .ld
// decode names them, and readiness is computed from the channel summary already
// persisted with every session. The analysis stays dark; the inventory is real.
//
// The ten agents and their remits are from prototypes/bytecraft-racing-host.jsx
// and RaceEngineeringAgent_v2.jsx. Do not add an agent here without adding the
// channels it reads — an agent with no declared inputs cannot be checked, and
// would silently report "ready" for a session that cannot feed it.

/** @typedef {{id:string,name:string,code:string,purpose:string,channels:string[]}} Agent */

/** @type {Agent[]} */
export const AGENTS = [
  {
    id: 'data',
    name: 'Data Analytics',
    code: 'ANL',
    purpose: 'Display and inference across the whole session.',
    channels: ['Ground Speed', 'Lap Number', 'Beacon', 'Session Elapsed Time'],
  },
  {
    id: 'aero',
    name: 'Aerodynamics',
    code: 'AER',
    purpose: 'Aero balance and what it contributes to pace.',
    channels: ['Ride Height FL', 'Ride Height FR', 'Ride Height RL', 'Ride Height RR', 'Ground Speed', 'G Force Vert'],
  },
  {
    id: 'tire',
    name: 'Tire',
    code: 'TIR',
    purpose: 'Temperatures, pressures, slip and wear against ideal.',
    channels: [
      'Tyre Temp FL Centre', 'Tyre Temp FR Centre', 'Tyre Temp RL Centre', 'Tyre Temp RR Centre',
      'Tyre Pressure FL', 'Tyre Pressure FR', 'Tyre Pressure RL', 'Tyre Pressure RR',
      'Tyre Wear FL', 'Tyre Wear FR', 'Tyre Wear RL', 'Tyre Wear RR',
      'Tyre Load FL', 'Tyre Load FR', 'Tyre Load RL', 'Tyre Load RR',
      'Grip Fract FL', 'Grip Fract FR', 'Grip Fract RL', 'Grip Fract RR',
      'Wheel Rot Speed FL', 'Wheel Rot Speed FR', 'Wheel Rot Speed RL', 'Wheel Rot Speed RR',
    ],
  },
  {
    id: 'power',
    name: 'Powertrain',
    code: 'PWR',
    purpose: 'Fuel level, energy scheme and powertrain strategy.',
    channels: ['Fuel Level', 'Engine RPM', 'Gear', 'Eng Oil Temp', 'Eng Water Temp', 'Battery Charge Level'],
  },
  {
    id: 'tele',
    name: 'Telemetry',
    code: 'TEL',
    purpose: 'Lap-versus-ideal deltas, turned into driver feedback.',
    channels: ['Throttle Pos', 'Brake Pos', 'Steering Wheel Position', 'G Force Lat', 'G Force Long', 'Delta Best'],
  },
  {
    id: 'strat',
    name: 'Strategy',
    code: 'STR',
    purpose: 'Session approach against the goal and the baseline.',
    channels: ['Lap Number', 'Fuel Level', 'Session Elapsed Time', 'Tyre Wear FL'],
  },
  {
    id: 'env',
    name: 'Environment',
    code: 'ENV',
    purpose: 'Weather, time of day and track condition.',
    channels: ['Ambient Temperature', 'Track Temperature'],
  },
  {
    id: 'kpi',
    name: 'KPI / Optimizer',
    code: 'KPI',
    purpose: 'Performance-driving KPIs and where the time is.',
    channels: ['Min Corner Speed', 'Max Straight Speed', 'Ground Speed', 'Throttle Pos', 'Brake Pos', 'Realtime Loss'],
  },
  {
    id: 'synth',
    name: 'Synthesizer',
    code: 'SYN',
    // No channels of its own: it consumes the specialists' output. Declared as
    // empty deliberately, and readiness() reports that rather than inventing a
    // green light — see DERIVED AGENTS below.
    purpose: 'Consolidates the specialists into one engineer report.',
    channels: [],
  },
  {
    id: 'user',
    name: 'User Agent',
    code: 'USR',
    purpose: 'Interprets what was asked and formats the answer.',
    channels: [],
  },
]

/**
 * Run depth. `agents` names which of the roster each tier actually runs — the
 * cost model (docs/ai-cost-model.md) is why Quick is not simply "all ten, but
 * faster".
 */
export const RUN_TIERS = [
  {
    id: 'quick',
    name: 'Quick',
    detail: 'Single-agent check',
    agents: ['data', 'user'],
  },
  {
    id: 'standard',
    name: 'Standard',
    detail: 'Core specialists plus synthesis',
    agents: ['data', 'tire', 'tele', 'kpi', 'synth', 'user'],
  },
  {
    id: 'deep',
    name: 'Deep',
    detail: 'Full ten-agent analysis',
    agents: AGENTS.map((a) => a.id),
  },
]

export function tierById(id) {
  return RUN_TIERS.find((t) => t.id === id) ?? RUN_TIERS[1]
}

/** Does this tier run that agent? */
export function tierRuns(tier, agentId) {
  return Boolean(tier?.agents?.includes(agentId))
}

/**
 * Which of an agent's inputs this session can actually feed it.
 *
 * Three outcomes, kept distinct because they mean different things to a driver:
 *   - `present` — logged with real values.
 *   - `empty`   — logged, but all zero. LMU ships GTE with Tyre Load, Grip
 *                 Fract and Battery permanently empty; a session can also
 *                 zero a channel on its own. Either way the agent gets nothing.
 *   - `missing` — not in the export at all.
 *
 * DERIVED AGENTS. Synthesizer and User Agent read no telemetry; they read the
 * specialists. An agent with no declared inputs is reported as `derived`, not
 * as `ready` — saying "ready" would be a claim about data that was never
 * checked, which is the exact failure this module exists to prevent.
 *
 * @param {Agent} agent
 * @param {Array<{name:string, allZero?:boolean}>} channels  session summary channels
 */
export function readiness(agent, channels) {
  const required = agent?.channels ?? []
  if (required.length === 0) {
    return { state: 'derived', present: [], empty: [], missing: [], coverage: null }
  }

  const byName = new Map((channels ?? []).filter(Boolean).map((c) => [c.name, c]))
  const present = []
  const empty = []
  const missing = []
  for (const name of required) {
    const ch = byName.get(name)
    if (!ch) missing.push(name)
    else if (ch.allZero) empty.push(name)
    else present.push(name)
  }

  const coverage = present.length / required.length
  // `blocked` means nothing usable at all, not merely "some gaps": an agent
  // with three of four inputs still has something to say, and calling that
  // blocked would tell a driver to fix an export that is fine.
  const state = present.length === 0 ? 'blocked' : present.length === required.length ? 'ready' : 'partial'
  return { state, present, empty, missing, coverage }
}

/** Readiness for every agent in one pass, keyed by agent id. */
export function rosterReadiness(channels) {
  const out = {}
  for (const a of AGENTS) out[a.id] = readiness(a, channels)
  return out
}

/**
 * One-line summary of a tier's readiness, for the header.
 *
 * Counts only the agents the tier actually runs — a Quick run is not held back
 * by the Tire agent's empty GTE channels, because a Quick run never calls it.
 */
export function tierReadiness(tier, roster) {
  const ids = (tier?.agents ?? []).filter((id) => roster[id] && roster[id].state !== 'derived')
  const blocked = ids.filter((id) => roster[id].state === 'blocked')
  const partial = ids.filter((id) => roster[id].state === 'partial')
  return { checked: ids.length, blocked, partial, ready: ids.length - blocked.length - partial.length }
}
