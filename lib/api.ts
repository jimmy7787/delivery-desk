import {env} from "cloudflare:workers";
import {getAccessUser} from "./auth";
import {handleApi,response} from "./core";
export async function dispatch(request:Request){
  try{
    const user=await getAccessUser(request.headers);
    if(!user)return response({error:"Η σύνδεσή σου έληξε. Συνδέσου ξανά."},401);
    if(!env.DB)return response({error:"Η αποθήκευση είναι προσωρινά μη διαθέσιμη."},503);
    return handleApi(request,env.DB,user.userId);
  }catch(e){console.error("delivery_desk_request_error",e instanceof Error?e.message:"Unknown error");return response({error:"Η υπηρεσία είναι προσωρινά μη διαθέσιμη."},503);}
}
