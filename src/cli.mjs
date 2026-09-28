#!/usr/bin/env node
import { readFile, appendFile } from 'node:fs/promises';
import { OZY } from './index.mjs';
import { createLocalEmbedder } from './runtime/adapter.mjs';
const [command,...args]=process.argv.slice(2);
const print=value=>console.log(JSON.stringify(value,null,2));
try {
  if (!command || ['help','--help','-h'].includes(command)) {
    console.log(`OZY 0.1.0 — decisor local para PC
Uso:
  npm run model:download                  Baixar/verificar modelo base (não treina)
  npm start -- decide "abre a calculadora" Decidir e devolver JSON; não executa
  npm start -- risk "Esvaziar lixeira"      Avaliar risco
  npm run smoke:model                     Conferir inferência real
  npm run calibrate -- caminho.jsonl       Avaliar exemplos rotulados
  npm start -- record arquivo.jsonl '{"collection":"commands","text":"abra o editor","label":"abrir"}'

OZY_MODELS_DIR: diretório dos pesos; OZY_OFFLINE=1: proibir download.
Os dados gravados são locais. Nenhum treinamento é iniciado automaticamente.`);
  } else if (command === 'download') {
    const {garantirAssetsEmbeddingsLocais}=await import('./runtime/assets.mjs');
    print({status:'ready',directory:await garantirAssetsEmbeddingsLocais()});
  } else if(command === 'record') {
    if(args.length!==2) throw new Error('Use record arquivo.jsonl JSON');
    const row=JSON.parse(args[1]);
    if(!row || !['collection','text','label'].every(key=>typeof row[key]==='string' && row[key].trim())) throw new Error('Registro inválido.');
    await appendFile(args[0],JSON.stringify({collection:row.collection,text:row.text,label:row.label})+'\n',{mode:0o600});
    print({status:'recorded',trained:false});
  } else if(['decide','risk','smoke','calibrate'].includes(command)) {
    const embed=createLocalEmbedder();
    if(command==='smoke') {
      const vectors=await embed(['abrir a calculadora','uma receita de bolo'],'passage');
      if(vectors.length!==2 || vectors.some(v=>v.length!==384 || !v.every(Number.isFinite))) throw new Error('Inferência inválida.');
      print({status:'ready',model:'Xenova/multilingual-e5-small',dimensions:384,trained:false});
    } else {
      const ozy=new OZY({embed,timeoutMs:3000});
      const ready=await ozy.prepare();
      if(ready.status!=='ready') throw new Error('Modelo indisponível. Execute npm run model:download; confira onnxruntime-node e OZY_MODELS_DIR.');
      if(command==='decide') print(await ozy.decide(args.join(' ')));
      if(command==='risk') print(await ozy.risk(args.join(' ')));
      if(command==='calibrate') {
        if(args.length!==1) throw new Error('Informe o arquivo JSONL de avaliação.');
        const rows=(await readFile(args[0],'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
        if(!rows.length) throw new Error('Dataset vazio.');
        const details=[];
        for(const row of rows) {
          if(!row || !['collection','text','label'].every(k=>typeof row[k]==='string'&&row[k])) throw new Error('Linha de avaliação inválida.');
          const result=await ozy.classify(row.collection,row.text);
          details.push({...row,result,correct:result.status==='decided'&&result.label===row.label});
        }
        print({total:rows.length,correct:details.filter(r=>r.correct).length,abstained:details.filter(r=>r.result.status==='abstain').length,details});
      }
    }
  } else throw new Error('Comando desconhecido; use --help.');
} catch(error) {
  console.error(JSON.stringify({status:'error',error:String(error?.message||error)}));
  process.exitCode=1;
}
