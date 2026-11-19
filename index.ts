import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 try{
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader=req.headers.get('Authorization')||'';
  const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
  const {data:{user},error:authError}=await caller.auth.getUser();
  if(authError||!user||user.app_metadata?.role!=='admin') return new Response(JSON.stringify({error:'Accès réservé à l’administrateur.'}),{status:403,headers:{...cors,'Content-Type':'application/json'}});
  const {action,username,password}=await req.json();
  const clean=String(username||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,30}$/.test(clean)) throw new Error('Identifiant : 3 à 30 caractères (lettres, chiffres, point, tiret).');
  if(typeof password!=='string'||password.length<8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  const admin=createClient(url,service);
  const email=`${clean}@comptes.gestiondeclasse.invalid`;
  if(action==='create'){
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:'user',tenant_id:user.app_metadata.tenant_id,username:clean}});
   if(error) throw error;
   return new Response(JSON.stringify({id:data.user.id}),{headers:{...cors,'Content-Type':'application/json'}});
  }
  if(action==='reset'){
   const {data,error:findError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
   if(findError) throw findError;
   const target=data.users.find(u=>u.email===email && u.app_metadata?.tenant_id===user.app_metadata.tenant_id);
   if(!target) throw new Error('Utilisateur introuvable dans cette classe.');
   const {error}=await admin.auth.admin.updateUserById(target.id,{password}); if(error) throw error;
   return new Response(JSON.stringify({ok:true}),{headers:{...cors,'Content-Type':'application/json'}});
  }
  throw new Error('Action inconnue.');
 }catch(e){return new Response(JSON.stringify({error:e.message||'Erreur serveur'}),{status:400,headers:{...cors,'Content-Type':'application/json'}});}
});
