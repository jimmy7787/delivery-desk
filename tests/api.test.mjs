import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdir,writeFile,readdir} from "node:fs/promises";
import {createRequire} from "node:module";
import ts from "typescript";

const require=createRequire(import.meta.url);
const fromWrangler=createRequire(require.resolve("wrangler/package.json"));
const {Miniflare}=fromWrangler("miniflare");
await mkdir(".runtime",{recursive:true});
const source=await readFile("lib/core.ts","utf8");
await writeFile(".runtime/test-core.mjs",ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {handleApi}=await import("../.runtime/test-core.mjs");
const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",compatibilityDate:"2026-05-15",d1Databases:{DB:"test-production",UAT:"test-uat"}});
const db=await mf.getD1Database("DB"),uat=await mf.getD1Database("UAT");
for(const name of (await readdir("drizzle")).filter(n=>n.endsWith(".sql")).sort()){
  const sql=await readFile(`drizzle/${name}`,"utf8");
  for(const statement of sql.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean)){
    await db.prepare(statement).run();await uat.prepare(statement).run();
  }
}
async function call(method,path,input,user="alice",database=db,extra={}){
  const r=await handleApi(new Request("https://delivery.example"+path,{method,headers:{"content-type":"application/json",origin:"https://delivery.example",...extra},...(input===undefined?{}:{body:typeof input==="string"?input:JSON.stringify(input)})}),database,user);
  return {status:r.status,data:await r.json()};
}
await test("API, persistence and access isolation",async suite=>{
suite.after(()=>mf.dispose());
let project,task;
await suite.test("anonymous requests fail before any data access",async()=>{assert.equal((await call("GET","/api/projects",undefined,null)).status,401);});
await suite.test("create a project and retrieve persisted data",async()=>{
  const r=await call("POST","/api/projects",{name:"UAT preparation",description:"Integration test"});assert.equal(r.status,201);project=r.data.project;
  const list=await call("GET","/api/projects");assert.equal(list.data.projects[0].id,project.id);
});
await suite.test("user isolation applies to lists and project lookup",async()=>{
  assert.deepEqual((await call("GET","/api/projects",undefined,"bob")).data.projects,[]);
  assert.equal((await call("GET",`/api/tasks?project_id=${project.id}`,undefined,"bob")).status,404);
});
await suite.test("create and read a task with Greek owner and date",async()=>{
  const r=await call("POST","/api/tasks",{project_id:project.id,title:"Έλεγχος API",assignee:"Δημήτρης",due_date:"2026-09-30",status:"OPEN"});assert.equal(r.status,201);task=r.data.task;
  const list=await call("GET",`/api/tasks?project_id=${project.id}`);assert.equal(list.data.tasks[0].assignee,"Δημήτρης");assert.equal(list.data.tasks[0].version,1);
});
await suite.test("another user cannot create or modify tasks in this project",async()=>{
  assert.equal((await call("POST","/api/tasks",{project_id:project.id,title:"Forbidden"},"bob")).status,404);
  assert.equal((await call("PATCH",`/api/tasks/${task.id}`,{title:"Forbidden",version:1},"bob")).status,404);
});
await suite.test("update status and reject stale concurrent updates",async()=>{
  const r=await call("PATCH",`/api/tasks/${task.id}`,{title:task.title,assignee:task.assignee,due_date:task.due_date,status:"DONE",version:1});assert.equal(r.status,200);assert.equal(r.data.task.version,2);assert.equal(r.data.task.status,"DONE");
  assert.equal((await call("PATCH",`/api/tasks/${task.id}`,{title:"Stale",version:1})).status,409);
  assert.equal((await call("GET",`/api/tasks?project_id=${project.id}`)).data.tasks[0].status,"DONE");
});
await suite.test("invalid dates, empty titles, invalid statuses and unknown fields are rejected",async()=>{
  for(const payload of [{title:""},{title:"X",due_date:"2026-02-30"},{title:"X",status:"NOT_VALID"},{title:"X",user_id:"bob"}])assert.equal((await call("POST","/api/tasks",{project_id:project.id,...payload})).status,400);
  assert.equal((await call("GET",`/api/tasks?project_id=${project.id}`)).data.tasks.length,1);
});
await suite.test("malformed and oversized payloads are rejected",async()=>{
  assert.equal((await call("POST","/api/projects","{")).status,400);
  assert.equal((await call("POST","/api/projects",JSON.stringify({name:"a".repeat(17000)}))).status,413);
});
await suite.test("cross-origin writes and incorrect content type are rejected",async()=>{
  assert.equal((await call("POST","/api/projects",{name:"CSRF"},"alice",db,{origin:"https://other.example"})).status,403);
  assert.equal((await call("POST","/api/projects",{name:"Bad type"},"alice",db,{"content-type":"text/plain"})).status,415);
});
await suite.test("SQL-looking input is stored literally and cannot alter tables",async()=>{
  const title="x'); DROP TABLE projects; --";
  const r=await call("POST","/api/tasks",{project_id:project.id,title});assert.equal(r.status,201);assert.equal(r.data.task.title,title);
  assert.equal((await call("GET","/api/projects")).data.projects.length,1);
});
await suite.test("UAT data is isolated from production",async()=>{
  assert.deepEqual((await call("GET","/api/projects",undefined,"alice",uat)).data.projects,[]);
  await call("POST","/api/projects",{name:"UAT only"},"alice",uat);
  assert.equal((await call("GET","/api/projects")).data.projects[0].name,"UAT preparation");
});

});
