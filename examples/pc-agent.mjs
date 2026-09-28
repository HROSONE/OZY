import { OZY, runAgent } from '../src/index.mjs';
import { createLocalEmbedder } from '../src/runtime/adapter.mjs';

// Run: node examples/pc-agent.mjs
// The executor is deliberately an injected adapter. This demo does not click or launch apps.
const ozy=new OZY({embed:createLocalEmbedder(),timeoutMs:3000});
if((await ozy.prepare()).status!=='ready') throw new Error('Prepare o modelo com npm run model:download.');
const decision=await ozy.decide('abre a calculadora');
console.log(JSON.stringify(decision,null,2));

export async function runOnPC(objective, adapters) {
  return runAgent({
    objective,
    observe:adapters.observe,
    propose:async ({state})=>{
      // A real host can use state.apps / state.elements with ozy.select / selectElement,
      // and can delegate compound tasks to a planner when OZY abstains.
      if(state.goalReached===true) return {done:true};
      const d=await ozy.decide(objective);
      if(!d.command) return {status:'abstain'};
      return {action:d.command};
    },
    authorize:adapters.authorize,
    execute:adapters.execute,
    verify:adapters.verify,
    maxSteps:3,
  });
}
