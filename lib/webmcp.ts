import type {Project,Task,TaskDraft} from "./model";
type Actions={listProjects:()=>Promise<unknown>;createProject:(d:{name:string;description:string})=>Promise<Project>;createTask:(id:string,d:TaskDraft)=>Promise<Task>};
type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>Promise<unknown>};
export function registerWorkspaceTools(actions:Actions){
  const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>unknown}}).modelContext;
  if(!context?.registerTool)return;
  const life=new AbortController();
  const tools:Tool[]=[
    {name:"list_projects",description:"Read the signed-in user's saved projects.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>actions.listProjects()},
    {name:"create_project",description:"Create a saved project and select it in the visible workspace.",inputSchema:{type:"object",properties:{name:{type:"string",minLength:1,maxLength:120},description:{type:"string",maxLength:1000}},required:["name"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input)=>{if(!input||typeof input!=="object"||typeof (input as {name?:unknown}).name!=="string")throw new Error("Project name is required");const d=input as {name:string;description?:string};return actions.createProject({name:d.name,description:d.description??""});}},
    {name:"create_task",description:"Create a saved task in a specified project. Owner and deadline are optional.",inputSchema:{type:"object",properties:{project_id:{type:"string"},title:{type:"string",minLength:1,maxLength:200},assignee:{type:"string",maxLength:120},due_date:{type:["string","null"],pattern:"^\\d{4}-\\d{2}-\\d{2}$"}},required:["project_id","title"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input)=>{if(!input||typeof input!=="object")throw new Error("Task input is required");const d=input as {project_id:string;title:string;assignee?:string;due_date?:string|null};return actions.createTask(d.project_id,{title:d.title,notes:"",assignee:d.assignee??"",due_date:d.due_date??null,status:"OPEN"});}}
  ];
  for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}}
  return()=>life.abort();
}
