import test from 'node:test';
import assert from 'node:assert/strict';
import {OZY,cosseno,contarVotos,candidatoAComando,runAgent} from '../src/index.mjs';

// Controlled vectors verify logic only; they do NOT measure the semantic model's quality.
const embed=async texts=>texts.map(t=>t.includes('alpha')?[1,0]:t.includes('beta')?[0,1]:[.707,.707]);
const make=()=>new OZY({embed,timeoutMs:40});
const labels={a:['alpha 1','alpha 2','alpha 3','alpha 4','alpha 5'],b:['beta 1','beta 2','beta 3','beta 4','beta 5']};
test('cosine rejects malformed and mismatched vectors',()=>{
 assert.equal(cosseno([1,0],[1,0]),1);
 for(const [a,b] of [[[1],[1,2]],[[NaN],[1]],[[0],[1]],[[],[]]]) assert.equal(cosseno(a,b),0);
});
test('learned near-identical example wins outside top five',()=>{
 const r=contarVotos([...Array.from({length:5},()=>({rotulo:'a',aprendido:false,semelhanca:1})),{rotulo:'b',aprendido:true,semelhanca:1}],5);
 assert.equal(r.identico,'b');
});
test('weighted learned votes retain weight two',()=>{
 const r=contarVotos([{rotulo:'b',aprendido:true,semelhanca:.9},{rotulo:'a',aprendido:false,semelhanca:.8}],5);
 assert.equal(r.votos.get('b'),2);assert.equal(r.total,3);
});
test('classifies, corrects and exports without touching weights',async()=>{
 const o=make();await o.register('x',labels);
 assert.equal((await o.classify('x','alpha request')).label,'a');
 await o.correct('x','alpha request','b');
 assert.equal((await o.classify('x','alpha request')).label,'b');
 assert.deepEqual(o.exportCorrections(),[{collection:'x',text:'alpha request',label:'b'}]);
});
test('instances do not share examples or corrections',async()=>{
 const a=make(),b=make();await a.register('x',labels);
 assert.equal((await b.classify('x','alpha')).status,'abstain');
});
test('timeouts, exceptions, invalid vectors abstain',async()=>{
 for(const fn of [()=>new Promise(()=>{}),()=>{throw new Error('offline')},async()=>[[NaN]],async texts=>texts.map(()=>[0,0])]) {
  const o=new OZY({embed:fn,timeoutMs:5});
  assert.equal((await o.register('x',labels,{timeoutMs:5})).status,'abstain');
 }
});
test('embedding dimension cannot change mid-session',async()=>{
 let dim=2;const o=new OZY({embed:async texts=>texts.map(()=>Array(dim).fill(1))});
 await o.register('x',labels);dim=3;
 assert.equal((await o.classify('x','new text')).status,'abstain');
});
test('ties and ambiguous candidates abstain',async()=>{
 const o=make();await o.register('x',{a:['alpha'],b:['beta']});
 assert.equal((await o.classify('x','neutral')).status,'abstain');
 assert.equal((await o.select('alpha',[{id:'1',text:'alpha'},{id:'2',text:'alpha'}])).status,'abstain');
});
test('missing model never means risk approval',async()=>{
 const o=make();assert.equal((await o.risk('Próxima página')).status,'review');
 assert.equal((await o.risk('Esvaziar lixeira')).status,'review');
 assert.equal((await o.decide('oi')).status,'abstain');
});
test('command parser retains OZY name, rejects compound and vague tasks',()=>{
 assert.equal(candidatoAComando('OZY, abre a calculadora').acao,'abrir');
 for(const text of ['como abro um zip?','abre o projeto e roda os testes','abre uma conta no banco']) assert.equal(candidatoAComando(text),null);
 assert.equal(candidatoAComando('aumenta o volume').descricao,'aumentar o volume');
});
test('element selection excludes disabled/hidden fields and reports risk',async()=>{
 const o=make();
 const r=await o.selectElement('campo E-mail','digitar',[{seletor:'#bad',tag:'input',nome:'E-mail',disabled:true},{seletor:'#hidden',tag:'input',tipo:'hidden',nome:'E-mail'},{seletor:'#ok',tag:'input',nome:'E-mail'}]);
 assert.equal(r.selector,'#ok');assert.equal(r.executed,false);assert.equal(r.risk.status,'review');
});
test('invalid corrections and duplicate candidate ids are rejected',async()=>{
 const o=make();await o.register('x',labels);await assert.rejects(o.correct('x','alpha','missing'));
 assert.equal((await o.select('alpha',[{id:'a',text:'alpha'},{id:'a',text:'beta'}])).status,'abstain');
});
const host=()=>({objective:'test',observe:async()=>({}),propose:async()=>({action:{acao:'abrir',alvo:'calculator'}}),authorize:async()=>true,execute:async()=>({ok:true}),verify:async()=>({ok:true,evidence:'observed'})});
test('agent does not execute without explicit adapter authorization',async()=>{
 let calls=0;const r=await runAgent({...host(),authorize:async()=>false,execute:async()=>{calls++;return{ok:true}}});
 assert.equal(r.status,'needs-authorization');assert.equal(calls,0);
});
test('agent does not mistake execution failure for completion',async()=>{
 const r=await runAgent({...host(),execute:async()=>({ok:false,error:'not found'})});assert.equal(r.status,'failed');assert.equal(r.history.length,1);
});
test('completion requires evidence; step limit and cancellation work',async()=>{
 assert.equal((await runAgent({...host(),propose:async()=>({done:true}),verify:async()=>({ok:true})})).status,'unverified');
 assert.equal((await runAgent({...host(),propose:async()=>({done:true})})).status,'completed');
 assert.equal((await runAgent({...host(),maxSteps:1})).status,'step-limit');
 assert.equal((await runAgent({...host(),signal:AbortSignal.abort()})).status,'cancelled');
});
test('authorization callback cannot mutate the action being executed',async()=>{
 let actual;
 await runAgent({...host(),maxSteps:1,authorize:async({action})=>{action.alvo='changed';return true},execute:async action=>{actual=action.alvo;return{ok:true}}});
 assert.equal(actual,'calculator');
});
test('confirmed simple commands override unrelated route and family noise',async()=>{
 const o=make();
 o.classify=async name=> name==='commands' ? {status:'decided',label:'abrir',votes:{abrir:5}} : {status:'decided',label:'sim',votes:{sim:5}};
 const d=await o.decide('abre a calculadora');
 assert.deepEqual(d.route,{programacao:false,pesquisa:false,acao:true});assert.equal(d.family,'pc');assert.equal(d.executed,false);
});
test('an unambiguous initial example is respected without query embedding noise',async()=>{
 const o=new OZY({embed:async texts=>texts.map(()=>[1,0])});
 await o.register('x',{a:['known a'],b:['known b']});
 assert.equal((await o.classify('x','known b')).label,'b');
});
test('Próxima página is not confused with pagamento',async()=>{
 const o=make();await o.register('risk',{seguro:['Próxima página'],irreversivel:['Pagar']});
 assert.equal((await o.risk('Próxima página')).status,'low-risk');
 assert.equal((await o.risk('Pagar')).status,'review');
});
