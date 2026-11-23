# Trial sheet

Fill one sheet per participant. Write what the participant said and did, in their words where possible. Do not interpret.

| Field                                                               | Value                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Participant                                                         | participant 1 / participant 2 (a name only with consent) |
| Date and place                                                      |                                                          |
| CDK experience (years, roles)                                       |                                                          |
| Machine (OS, chip) or Codespace                                     |                                                          |
| Version used (`git log --oneline -1` or the npm version)            |                                                          |
| Tools already installed before the trial (Node.js, pnpm, elan, git) |                                                          |

## Setup (guide section 2)

| Field                                                 | Value |
| ----------------------------------------------------- | ----- |
| Start time                                            |       |
| End time (end of `pnpm lean:build`)                   |       |
| Steps that failed or needed help, with the error text |       |

## Task (guide sections 3 and 4)

| Field                              | Value |
| ---------------------------------- | ----- |
| Start time                         |       |
| End time (said "done", or stopped) |       |
| Stopped before the end? Why?       |       |

1. After step 2 (the rejection), where did they look first? (the `ERROR` line, `Suggested fix`, `Acknowledge with`, the JSON report, the source, other)

2. Without help, could they say:

   | Question                      | Yes / partly / no | Their words |
   | ----------------------------- | ----------------- | ----------- |
   | Who can reach the data?       |                   |             |
   | Which data, and through what? |                   |             |
   | What should be changed?       |                   |             |

3. What did they change? (paste the diff, or describe it)

4. Did ProofGate accept the stack after the change? (exit code of step 4)

5. Did they try an acknowledgement (`Validations.of(app).acknowledge`), `allowedPassRoleTargets`, or deleting the plugin, instead of a fix? Which, and why?

6. Text they misread, asked about, or called confusing (quote it):

7. Questions they asked the observer (word for word), and any help given:

## At the end (ask these three questions, write the answers word for word)

1. "Who would use this?"
2. "What did it stop?"
3. "How did you fix it?"

Anything else they said:
