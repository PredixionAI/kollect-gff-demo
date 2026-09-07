# BRIEF · Predixion AI landing (GFF 2026 booth)

**Self-authored under explicit creative delegation.** Kamal's direction, verbatim
from the session: "refer to https://www.framer.com/ (this is how i want the
entire website with proper scroll features using the scrollcraft skill) …
maintain a proper enterprise grade like a YC startup design system and do
overhaul of the entire flow … logo also should not be like that instead use
the transparent white logo." The two attached reference screenshots were the
ElevenLabs agent console (dark sidebar, top bar, rounded panels, pill buttons)
as the target for the demo application's components. Everything below that is
not quoted is an authored decision.

## The eight topics

1. **Vibe** (authored): precise, calm, engineered, expensive. References
   supplied: framer.com (site), ElevenLabs console (application). Not a serif
   brand; a grotesk brand.
2. **Scroll journey** (authored, from the requested flow "little nice page about
   Predixion → the three demo cards → click Kollect starts the journey"):
   hero about Predixion → the cost of the status quo → what the agent does on a
   call → what the platform is underneath → choose your demo.
3. **Energy curve** (authored): calm open, tight and quiet middle, one loud
   moment where the call writes itself, calm again, then an invitation.
4. **Feel, stage by stage** (authored): recognition → discomfort → the click
   ("oh, it actually talks to them") → trust → invitation. **The peak** is the
   phone in act 3: the sample call typing itself under the visitor's own scroll.
5. **The one thing no site does** (authored): the call is scrubbed by scroll.
   Scroll forward and the agent speaks, sends the WhatsApp, closes the case;
   scroll back and it un-says it.
6. **Distance from premium-minimal** (Kamal): "enterprise grade like a YC
   startup design system", "strictly not … any ai slop design". Family:
   premium-minimal, dark, one accent, grotesk type. Earned by the brief, not
   defaulted to.
7. **One world or scenes** (authored): distinct scenes. No geography, no
   footage, a B2B software brand. Continuous world would be theatre.
8. **Assets** (Kamal): the Predixion alpha lockup, white on transparent
   (`public/img/logo-white.png`, `logo-mark-white.png`). No photography, no
   kie.ai key. Bring-your-own-assets build; the "imagery" is the product's own
   components rendered from the shared design system with labelled sample data.

## Grammar

**Filmic one-shot**, and why the other seven lost: chaptered editorial (no
long-form to read); live surface (Kollect itself is the live surface and it
begins on the click, the landing must stay marketing); continuous world (no
place to travel through, no assets); typographic poster (the brand's asset is a
product, and Kamal asked for product components); gallery (three objects, two
of them disabled); split stage (no two-sided argument in the brief); cutlist
(an energy grammar for an enterprise brand). Burden of proof met: a booth
attendee should be carried, once, to one action.

## Journey → feeling curve → score

| # | Beat | Feeling, caused by | Device | Span |
|---|---|---|---|---|
| 1 | Recognition | Calm confidence: the headline, then the product surface rising through it | `pin` + `parallax` (4 planes) + `kinetic` | 2.1 |
| 2 | Tension | Discomfort: plain type naming the dialing-list floor | `flow` + `in` | ~1 |
| 3 | Turn (PEAK) | The click: a call happening under your hand | `pin` + cues + signature move | 3.6 |
| 4 | Substance | Trust: what is underneath, asymmetric, no cards | `flow` + `reveal` | ~1.2 |
| 5 | Commitment | Invitation: the three agents, one live | `pin` + `spotlight` + `magnet` | 1.25 |

Five acts, ~9 viewport-heights. Families: pin, parallax, kinetic, flow/in,
reveal, cue, spotlight, magnet. No family twice in a row. Zero scrub acts (no
footage, honestly). Peak has the largest span by a visible margin (3.6 vs 2.1).

Authored silence: none. Drift stops: #0b0c10 → #0d0e13 → #0b0d12 → #0e1015 → #0b0c10.

## Signature move

**The scroll-scrubbed call.** `landing.js` reads the `--sc-p` the engine
publishes on the "turn" act each frame and renders a labelled sample Kollect
call into a phone frame: each transcript line lands at its own progress, the
agent "types" before speaking, the WhatsApp plan arrives mid-call, the outcome
chips stamp at the end, the status line and the thinking-orb change phase with
the call. Scrolling backwards reverses it. Engine untouched.

## The tell-someone sentence

"It's the site where you scroll and the agent actually has the call, sends the
WhatsApp, and closes the case under your hand."

## Hard rules honoured

No scroll cue, no section counters, one eyebrow-free page, no em dashes in
copy, no invented statistics (there are no counters), no gradient text or
glows, transform/opacity only, a real footer inside the closing stage, white
logo as supplied, Inter not used (Instrument Sans display, Geist text).
