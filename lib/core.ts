import {z} from "zod";

const projectSchema=z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000).default("")}).strict();
const validDate=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<"1900-01-01"||s>"2100-12-31")return false;const d=new Date(s+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
const taskSchema=z.object({title:z.string().trim().min(1).max(200),notes:z.string().trim().max(3000).default(""),assignee:z.string().trim().max(120).default(""),due_date:z.string().refine(validDate).nullable().default(null),status:z.enum(["OPEN","IN_PROGRESS","BLOCKED","DONE"]).default("OPEN")}).strict();
const createSchema=taskSchema.extend({project_id:z.string().uuid()});
const updateSchema=taskSchema.extend({version:z.number().int().positive()});
export class ApiError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function body(request:Request){
  if(request.headers.get("sec-fetch-site")==="cross-site")throw new ApiError(403,"Το αίτημα προήλθε από διαφορετική ιστοσελίδα.");
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,"Το αίτημα προήλθε από διαφορετική ιστοσελίδα.");
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new ApiError(415,"Απαιτείται JSON.");
  const text=await request.text();if(text.length>16384)throw new ApiError(413,"Τα στοιχεία υπερβαίνουν το επιτρεπόμενο μέγεθος.");
  try{return JSON.parse(text);}catch{throw new ApiError(400,"Μη έγκυρα στοιχεία αιτήματος.");}
}
async function owns(db:D1Database,userId:string,id:string){
  if(!z.string().uuid().safeParse(id).success)throw new ApiError(400,"Μη έγκυρο έργο.");
  const project=await db.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(id,userId).first();
  if(!project)throw new ApiError(404,"Το έργο δεν βρέθηκε.");
}
export async function handleApi(request:Request,db:D1Database,userId:string|null):Promise<Response>{
  try{
    if(!userId)throw new ApiError(401,"Η σύνδεσή σου έληξε. Συνδέσου ξανά.");
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,""),method=request.method;
    if(path==="/api/projects"&&method==="GET"){
      const rows=await db.prepare("SELECT id,name,description,created_at FROM projects WHERE user_id=? ORDER BY created_at DESC,id DESC").bind(userId).all();return response({projects:rows.results});
    }
    if(path==="/api/projects"&&method==="POST"){
      const d=projectSchema.parse(await body(request)),id=crypto.randomUUID(),now=new Date().toISOString();
      await db.prepare("INSERT INTO projects (id,user_id,name,description,created_at) VALUES (?,?,?,?,?)").bind(id,userId,d.name,d.description,now).run();
      return response({project:{id,name:d.name,description:d.description,created_at:now}},201);
    }
    if(path==="/api/tasks"&&method==="GET"){
      const id=url.searchParams.get("project_id")??"";await owns(db,userId,id);
      const rows=await db.prepare("SELECT id,project_id,title,notes,assignee,due_date,status,version,created_at,updated_at FROM tasks WHERE project_id=? ORDER BY created_at DESC,id DESC").bind(id).all();return response({tasks:rows.results});
    }
    if(path==="/api/tasks"&&method==="POST"){
      const d=createSchema.parse(await body(request));await owns(db,userId,d.project_id);
      const id=crypto.randomUUID(),now=new Date().toISOString();
      await db.prepare("INSERT INTO tasks (id,project_id,title,notes,assignee,due_date,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)").bind(id,d.project_id,d.title,d.notes,d.assignee,d.due_date,d.status,now,now).run();
      return response({task:{id,...d,version:1,created_at:now,updated_at:now}},201);
    }
    if(/^\/api\/tasks\/[^/]+$/.test(path)&&method==="PATCH"){
      const id=path.split("/").pop()!;if(!z.string().uuid().safeParse(id).success)throw new ApiError(400,"Μη έγκυρη εργασία.");
      const d=updateSchema.parse(await body(request));
      const current=await db.prepare("SELECT t.id FROM tasks t JOIN projects p ON t.project_id=p.id WHERE t.id=? AND p.user_id=?").bind(id,userId).first();
      if(!current)throw new ApiError(404,"Η εργασία δεν βρέθηκε.");
      const updated=await db.prepare("UPDATE tasks SET title=?,notes=?,assignee=?,due_date=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND project_id IN (SELECT id FROM projects WHERE user_id=?) RETURNING *").bind(d.title,d.notes,d.assignee,d.due_date,d.status,new Date().toISOString(),id,d.version,userId).first();
      if(!updated)throw new ApiError(409,"Η εργασία άλλαξε σε άλλη συνεδρία. Κλείσε τη φόρμα, κάνε ανανέωση και δοκίμασε ξανά.");
      return response({task:updated});
    }
    throw new ApiError(404,"Η ενέργεια δεν βρέθηκε.");
  }catch(e){
    if(e instanceof z.ZodError)return response({error:"Έλεγξε τα υποχρεωτικά πεδία, το μήκος του κειμένου και την ημερομηνία."},400);
    if(e instanceof ApiError)return response({error:e.message},e.status);
    console.error("delivery_desk_storage_error",e instanceof Error?e.message:"Unknown error");
    return response({error:"Δεν ήταν δυνατή η πρόσβαση στα δεδομένα. Τα στοιχεία σου παραμένουν στη φόρμα. Δοκίμασε ξανά."},503);
  }
}
