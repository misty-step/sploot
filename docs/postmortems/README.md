# Postmortems

A postmortem is the evidence-backed record of a production incident: what failed, its impact and timeline, the mechanism that permitted the failure, and the change that prevents the same class of failure. Keep incident records here so the incident ticket and future responders can find them.

Name each incident file `YYYY-MM-DD-short-incident-name.md` (incident date and a descriptive, lowercase hyphenated name). Start from the shared [pokayoke postmortem template](https://github.com/misty-step/harness/blob/5834348e2a0cd70404ca136dcf887c680dcf02ab/agent-config/skills/pokayoke/postmortem-template.md), not a local copy. Preserve its incident owner, ticket, impact, timeline and evidence fields; distinguish observations from inferences.

Every incident postmortem must have `## Pokayoke` and `## Follow-up`. In **Pokayoke**, identify the structural mechanism that rules out the failure class (shape, type, ownership, removed affordance or a failing-closed check), or state plainly that the class is still possible. In **Follow-up**, assign outstanding work and link the class-closing change and its regression check. Link the postmortem from the incident ticket; close that ticket only when the postmortem links the structural change and regression check that close the class, as required by FND-INC-001. A warning, extra instruction or unimplemented action does not close it.
