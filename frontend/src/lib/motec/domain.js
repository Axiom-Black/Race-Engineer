// Channel -> agent-domain classification (Ring 4 G4.2).
// Ported VERBATIM from the prototype (prototypes/ByteCraft_SessionUpload.jsx
// domainOf) — the committed mapping snapshot (fixtures/golden_master_domains.json)
// freezes this behavior; any change must update the snapshot deliberately.
// Dormant consumer in the pilot (agents are dark); drives the channel-
// inventory UI filters today and specialist routing in Phase 2.

export const DOMAINS = [
  'Telemetry', 'Tire', 'Brakes', 'Aero', 'Powertrain', 'Environment', 'GPS', 'Session',
];

export function domainOf(name) {
  const n = name.toLowerCase();
  if (/tyre temp|tyre pressure|tyre load|tyre wear|grip fract|wheel rot/.test(n)) return 'Tire';
  if (/brake temp|brake bias/.test(n)) return 'Brakes';
  if (/ride height/.test(n)) return 'Aero';
  if (/fuel|battery|water temp|oil temp/.test(n)) return 'Powertrain';
  if (/ambient|track temp/.test(n)) return 'Environment';
  if (/gps/.test(n)) return 'GPS';
  if (/beacon|marker|lap number|delta|elapsed|straight speed|corner speed|realtime loss|ffb/.test(n)) return 'Session';
  return 'Telemetry';
}
