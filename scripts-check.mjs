import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function check(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory()) check(path);
    else if(path.endsWith('.mjs')) {
      const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
      if(r.status!==0) process.exit(r.status||1);
    }
  }
}
for(const dir of ['src','examples','test','scripts']) check(dir);
console.log('Sintaxe OK');
