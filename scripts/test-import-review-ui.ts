// Isolated UI fixture: no app credentials, real patients, or database calls.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

async function main() {
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ImportReviewList}from'./src/components/animasign/ImportReviewList';createRoot(document.getElementById('root')).render(<ImportReviewList/>);`,resolveDir:process.cwd(),loader:'tsx' },
  bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},
  alias:{'@':process.cwd()+'/src'},plugins:[{name:'fixture-store',setup(b){b.onResolve({filter:/useAppStore$/},()=>({path:'fixture-store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const useAppStore=()=>({locale:'de',theme:'light'});",loader:'js'}));}}],
});
const server=createServer((_,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:16px system-ui;margin:24px;color:#183d31;background:#fafbf8}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const address=server.address();assert.ok(address&&typeof address!=='string');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  await mkdir('tmp/intake-review-ui',{recursive:true});
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]] as const){
    const page=await browser.newPage({viewport:{width,height}});let fail=true;
    await page.route('**/api/anima-sign/import-reviews?*',async route=>{
      if(fail){await route.fulfill({status:503,json:{error:'unavailable'}});return;}
      const index=Number(new URL(route.request().url()).searchParams.get('page'));
      const items=Array.from({length:index?1:15},(_,i)=>({id:String(index*15+i),external_id:'Synthetic-'+i,first_name:i?'Langer synthetischer Vorname':'<img src=x onerror="window.injected=true">',last_name:'Synthetischer-Testfall-Mit-Einem-Sehr-Langen-Namen',reason:'birthdate_missing',created_at:'2020-01-01'}));
      await route.fulfill({json:{items,total:16,page:index,pageSize:15}});
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('alert').waitFor();fail=false;
    await page.getByRole('button',{name:'Erneut laden'}).click();
    await page.locator('li').first().waitFor();assert.equal(await page.locator('li').count(),15);
    assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>Boolean((window as any).injected)),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`tmp/intake-review-ui/${label}.png`,fullPage:true});
    await page.getByRole('button',{name:'Weiter',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('li').length===1);
    assert.equal(await page.getByRole('button',{name:'Weiter',exact:true}).isDisabled(),true);
    await page.close();
  }
  console.log('Import review UI: desktop/mobile, retry, pagination, escaping, overflow passed.');
}finally{await browser.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
