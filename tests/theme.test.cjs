const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {test} = require('node:test');
const vm = require('node:vm');
const path = require('node:path');

for(const page of ['index.html','tools/index.html','dev/index.html']) {
  const html=readFileSync(path.join(__dirname,'..',page),'utf8');
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0];
  function boot({cookie='',local={},blocked=false,query=''}={}) {
    const attrs={}; let cookies=cookie;
    const state={URLSearchParams, navigator:{language:'zh-CN'},location:{hostname:'tools.xue.moe',pathname:'/',hash:'',search:query},history:{replaceState(){}},
      document:{documentElement:{setAttribute(key,value){attrs[key]=value;}},get cookie(){return cookies;},set cookie(value){cookies+=';'+value.split(';')[0];}},
      localStorage:{getItem(key){if(blocked)throw new Error('denied');return local[key]||null;},setItem(key,value){if(blocked)throw new Error('denied');local[key]=value;}}
    };
    vm.runInNewContext(script[1],state);
    return attrs;
  }
  test(`${page}: saved theme is resolved before page styles, with shared-cookie and storage-failure support`,()=>{
    assert.ok(script.index<html.indexOf('<style>'));
    assert.equal(boot({local:{'xue-theme':'dark'}})['data-theme'],'dark');
    assert.equal(boot({cookie:'xue-theme=light',local:{'xue-theme':'dark'}})['data-theme'],'light');
    assert.equal(boot({cookie:'xue-theme=dark',blocked:true})['data-theme'],'dark');
    assert.equal(boot({cookie:'xue-theme=%invalid',local:{'xue-theme':'dark'}})['data-theme'],'dark');
    assert.equal(boot({cookie:'xue-theme=dark',query:'?theme=light'})['data-theme'],'light');
    assert.equal(boot({blocked:true})['data-theme'],undefined);
    assert.match(html,/html\[data-theme="dark"\] \{ color-scheme: dark/);
    assert.match(html,/html:not\(\[data-theme="light"\]\) \{ color-scheme: dark/);
  });
}
