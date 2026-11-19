const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const createClient = window.supabase?.createClient;

const $ = (id) => document.getElementById(id);
const authBox = $('auth'), appBox = $('application');
const status = (msg) => { $('sync-status').textContent = msg; };
const validConfig = !SUPABASE_URL.includes('VOTRE-PROJET') && !SUPABASE_ANON_KEY.includes('VOTRE_CLE');
let sb, currentUser, dirty = false, saveTimer, remoteApplying = false;
const USER_DOMAIN = 'comptes.gestiondeclasse.invalid';
const usernameEmail = (u) => `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@${USER_DOMAIN}`;

function showError(msg){ $('auth-msg').textContent = msg; }
function showApp(user){
  currentUser = user;
  authBox.hidden = true; appBox.hidden = false;
  const meta = user.app_metadata || {};
  $('connected-user').textContent = `Connecté : ${meta.username || user.email} (${meta.role === 'admin' ? 'administrateur' : 'utilisateur'})`;
  $('admin-users').hidden = meta.role !== 'admin';
  window.dispatchEvent(new CustomEvent('classapp-ready'));
}
function getLocal(){ try { return localStorage.getItem('gestclasse_v2'); } catch { return null; } }
async function loadCloud(){
  if (!navigator.onLine) { status('Hors ligne : données locales utilisées.'); return; }
  const { data, error } = await sb.from('class_data').select('payload,updated_at').eq('tenant_id', currentUser.app_metadata.tenant_id).maybeSingle();
  if(error){ status('Connexion au serveur impossible : mode local.'); return; }
  if(data?.payload){
    const local = getLocal();
    if(!local || !dirty){ remoteApplying=true; localStorage.setItem('gestclasse_v2', JSON.stringify(data.payload)); remoteApplying=false; }
  } else if(getLocal()) { await pushCloud(); }
  status('Données synchronisées.');
}
async function pushCloud(){
  if(!currentUser || !navigator.onLine || remoteApplying) return;
  let payload; try { payload=JSON.parse(getLocal() || 'null'); } catch { return; }
  if(!payload) return;
  const tenant_id = currentUser.app_metadata.tenant_id;
  const { error } = await sb.from('class_data').upsert({tenant_id,payload,updated_at:new Date().toISOString()},{onConflict:'tenant_id'});
  if(error){ status('Synchronisation en attente : '+error.message); return; }
  dirty=false; status('Envoyé au serveur à '+new Date().toLocaleTimeString());
}
async function syncNow(){
  if(!currentUser || !navigator.onLine){status('Hors ligne : données conservées sur cet appareil.');return;}
  if(dirty){await pushCloud();return;}
  const {data,error}=await sb.from('class_data').select('payload,updated_at').eq('tenant_id',currentUser.app_metadata.tenant_id).maybeSingle();
  if(error){status('Lecture du serveur impossible : '+error.message);return;}
  if(data?.payload){remoteApplying=true;localStorage.setItem('gestclasse_v2',JSON.stringify(data.payload));remoteApplying=false;status('Données récupérées du serveur.');if(window.classAppStarted)location.reload();}
  else {await pushCloud();}
}
function scheduleSync(){ if(remoteApplying) return; dirty=true; clearTimeout(saveTimer); status(navigator.onLine?'Modifications à synchroniser…':'Hors ligne : modifications conservées sur cet appareil.'); saveTimer=setTimeout(pushCloud,1200); }
function installStorageSync(){
  const originalSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){ originalSet.call(this,key,value); if(key==='gestclasse_v2') scheduleSync(); };
  window.addEventListener('online',()=>{ status('Connexion rétablie. Synchronisation…'); syncNow(); });
  window.addEventListener('focus',()=>{ if(currentUser && navigator.onLine) syncNow(); });
  $('sync-now').addEventListener('click',syncNow);
}
async function adminAction(action, username, password){
  const {data:{session}}=await sb.auth.getSession();
  const res=await fetch(`${SUPABASE_URL}/functions/v1/admin-users`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':SUPABASE_ANON_KEY},body:JSON.stringify({action,username,password})});
  const json=await res.json(); if(!res.ok) throw new Error(json.error || 'Opération refusée'); return json;
}
function setupAdminUI(){
 $('admin-users').addEventListener('click',()=>$('users-dialog').showModal());
 $('create-user').addEventListener('click',async()=>{try{await adminAction('create',$('new-user').value,$('new-pass').value);$('users-msg').textContent='Compte créé. Communiquez les identifiants à l’utilisateur.';}catch(e){$('users-msg').textContent=e.message;}});
 $('reset-user').addEventListener('click',async()=>{try{await adminAction('reset',$('new-user').value,$('new-pass').value);$('users-msg').textContent='Mot de passe réinitialisé.';}catch(e){$('users-msg').textContent=e.message;}});
 $('logout').addEventListener('click',async()=>{if(navigator.onLine) await sb.auth.signOut(); location.reload();});
}
async function boot(){
 if(!createClient){ showError('Le module de connexion ne peut pas être chargé. Connectez-vous une première fois à Internet.'); return; }
 if(!validConfig){ showError('Configuration serveur à compléter : ouvrez config.js et renseignez les clés Supabase.'); return; }
 sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 $('login-form').addEventListener('submit',async(e)=>{e.preventDefault();showError('');if(!navigator.onLine){showError('Une première connexion nécessite Internet. Reconnectez-vous pour ouvrir une session.');return;}const username=$('login-user').value.trim();const password=$('login-pass').value;const {data,error}=await sb.auth.signInWithPassword({email:usernameEmail(username),password});if(error){showError('Identifiant ou mot de passe incorrect.');return;} currentUser=data.user; if(!data.user.app_metadata?.tenant_id){await sb.auth.signOut();showError('Compte non configuré. Contactez l’administrateur.');return;} await loadCloud(); installStorageSync(); setupAdminUI(); showApp(data.user); if(window.startClassApp && !window.classAppStarted){window.classAppStarted=true;window.startClassApp();} });
 const {data:{session}}=await sb.auth.getSession();
 if(session?.user?.app_metadata?.tenant_id){
   currentUser=session.user;
   if(navigator.onLine) await loadCloud();
   installStorageSync(); setupAdminUI(); showApp(session.user); if(window.startClassApp && !window.classAppStarted){window.classAppStarted=true;window.startClassApp();}
 } else if(session && !navigator.onLine){showError('Session locale non reconnue. Reconnectez-vous une fois avec Internet.');}
}
boot().catch(e=>showError('Erreur de démarrage : '+e.message));
