// The 3 Meta templates this demo needs. Submit these exact name/category/
// header/body/footer combinations in Meta Business Manager (via whatever
// Vobiz gives you for template creation) — approval takes 24-48h (PRD §8),
// so submit before wiring anything live.
//
// All three are UTILITY category (transactional/operational, not marketing)
// — matches PRD §7.1's existing draft for the escalation template.
//
// Design note: the dashboard's scripted timeline has 4 borrower archetypes
// (technical / systemic / disputed / unreachable — see personaPacks() in
// public/js/dashboard.js), each with different Round-2 and hand-off wording,
// and the hand-off can go to either the borrower or the human agent
// depending on which archetype fires. Rather than one fixed template per
// archetype (more Meta submissions, and drift the moment the script copy
// changes), each template's body is a SINGLE dynamic placeholder — the
// exact on-screen text (public/js/dashboard.js's `s.live.lines`, joined) is
// sent as-is. What the attendee sees on the dashboard IS what gets sent,
// always, with no separate copy to keep in sync.
//
// Language: written in Hinglish/English mixed script (matching the existing
// scripted dashboard copy) but there's no "Hinglish" Meta language code.
// Register under `en` unless whoever submits finds a better fit — this is
// a judgment call only the person submitting (with Meta Business Manager
// access) can actually make; it isn't code-verifiable from here.
function singleBodyComponents({ message }) {
  return [{ type: 'body', parameters: [{ type: 'text', text: String(message) }] }];
}

module.exports = {
  // Sent to the ATTENDEE. Round 1 of the scripted dashboard timeline —
  // identical text across all 4 archetypes.
  paymentReminder: {
    name: 'kollect_demo_payment_reminder',
    category: 'UTILITY',
    language: 'en',
    header: 'Kollect',
    footer: 'Live Predixion AI product demo, not a real bill.',
    body: '{{1}}',
    variables: ['message'],
    buildComponents: singleBodyComponents,
  },

  // Sent to the ATTENDEE. Round 2, and also the final borrower-facing
  // message for archetypes that resolve without escalation (technical,
  // systemic) — whichever text the scripted timeline shows at that step.
  followup: {
    name: 'kollect_demo_followup',
    category: 'UTILITY',
    language: 'en',
    header: 'Kollect',
    footer: 'Live Predixion AI product demo, not a real bill.',
    body: '{{1}}',
    variables: ['message'],
    buildComponents: singleBodyComponents,
  },

  // Sent to the HUMAN AGENT (WHATSAPP_HUMAN_AGENT_NUMBER), never the
  // borrower. Fires only for the 2 archetypes that escalate (disputed,
  // unreachable). Title-case "Case Escalation" header, per PRD §7.1's draft.
  escalation: {
    name: 'kollect_demo_case_escalation',
    category: 'UTILITY',
    language: 'en',
    header: 'Case Escalation',
    footer: 'Kollect demo booth alert.',
    body: '{{1}}',
    variables: ['message'],
    buildComponents: singleBodyComponents,
  },
};
