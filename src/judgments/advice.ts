import type { Assessment, Prepared } from "./types";
import type { Reply } from "./wire";

import { OrlyError } from "../model";
import { ADVICE_THRESHOLD, ASSERTION_ACTIONS, CHOICE, REPLY_KEY } from "./constants";

const UNCERTAIN_ACTION = "Inspect the selected context and supply any missing evidence. This uncertain answer suggests no repair or approval.";

export function assess(prepared: Prepared, reply: Reply): Assessment {
  const answer = reply.answers[REPLY_KEY];
  if (!answer) throw new OrlyError("Validated reply has no requested answer.");
  if (answer.type === "noul") {
    const yes = answer.noul >= 0.5;
    const strength = yes ? answer.noul : 1 - answer.noul;
    const uncertain = strength < ADVICE_THRESHOLD;
    return {
      decision: yes ? "yes" : "no", strength, uncertain,
      concern: !uncertain && yes === prepared.definition.yesIsConcern,
      action: uncertain ? UNCERTAIN_ACTION : yes ? prepared.definition.yesAction : prepared.definition.noAction,
    };
  }
  const probability = answer.probabilities[answer.choice];
  const action = Object.entries(ASSERTION_ACTIONS).find(([choice]) => choice === answer.choice)?.[1];
  if (probability === undefined || action === undefined) throw new OrlyError("Answer has no cataloged follow-up action.");
  const strength = Math.min(answer.confidence, probability);
  const uncertain = strength < ADVICE_THRESHOLD || answer.choice === CHOICE.insufficient;
  return {
    decision: answer.choice, strength, uncertain,
    concern: !uncertain && answer.choice !== CHOICE.exact,
    action: uncertain ? UNCERTAIN_ACTION : action,
  };
}
