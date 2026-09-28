import {OZY} from '../src/index.mjs';
import {createLocalEmbedder} from '../src/runtime/adapter.mjs';
const o=new OZY({embed:createLocalEmbedder(),timeoutMs:3000});
let started=performance.now();console.log(JSON.stringify({prepare:await o.prepare(),ms:performance.now()-started}));
for(const text of ['OZY, abre a calculadora','abaixa o volume','pausa a música','oi, tudo bem?','cria um script em python','qual a previsão do tempo amanhã?','organiza minha pasta de downloads']) {
 started=performance.now();console.log(JSON.stringify({text,decision:await o.decide(text),ms:performance.now()-started}));
}
for(const target of ['Esvaziar lixeira','Próxima página','Enviar mensagem']) console.log(JSON.stringify({target,risk:await o.risk(target)}));
console.log(JSON.stringify({selection:await o.select('editor de código',[{id:'vscode',text:'Visual Studio Code editor de código'},{id:'calc',text:'Calculadora'}])}));
