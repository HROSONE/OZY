/** Host supplies observation, proposal, authorization, execution and verification.
 * OZY never converts UI text, a score, or a success claim into permission.
 */
export async function runAgent({ objective, observe, propose, authorize, execute, verify, maxSteps=10, signal }) {
  for (const fn of [observe,propose,authorize,execute,verify]) if (typeof fn !== 'function') throw new TypeError('Adaptador incompleto.');
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new TypeError('maxSteps deve estar entre 1 e 100.');
  const history=[];
  for (let step=0; step<maxSteps; step++) {
    if (signal?.aborted) return {status:'cancelled',history};
    try {
      const state=await observe({signal});
      const proposal=await propose({objective,state,history:structuredClone(history),signal});
      if (!proposal || proposal.status === 'abstain') return {status:'needs-review',history};
      if (proposal.done === true) {
        const evidence=await verify({objective,state,history:structuredClone(history),signal});
        return evidence?.ok === true && typeof evidence.evidence === 'string' && evidence.evidence.trim()
          ? {status:'completed',evidence:evidence.evidence,history} : {status:'unverified',history};
      }
      if (!proposal.action || typeof proposal.action !== 'object') return {status:'needs-review',history};
      const action=structuredClone(proposal.action);
      const permission=await authorize({objective,state,action:structuredClone(action),signal});
      if (permission !== true) return {status:'needs-authorization',history};
      if (signal?.aborted) return {status:'cancelled',history};
      const result=await execute(structuredClone(action),{signal});
      history.push({action,result:structuredClone(result)});
      if (result?.ok !== true) return {status:'failed',history};
    } catch(error) { return {status:'failed',error:String(error?.message||error),history}; }
  }
  return {status:'step-limit',history};
}
