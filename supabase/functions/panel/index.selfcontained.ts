/* Codism AI Panel — Supabase Edge Function (Deno)
 Env vars:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE, UPSTREAM_API_KEY, UPSTREAM_BASE_URL (default https://codecraftapi.com/v1),
  MODEL_ALIASES (JSON), JWT_SECRET (>=32 chars), ADMIN_EMAIL, ADMIN_PASSWORD, MAX_BODY_MB (default 8),
  PANEL_UI_URL (default https://pvwvuow.github.io/codism/), REGISTRATION_OPEN (default "true"), ALLOWED_MODELS (csv, optional)
*/
const BROWSER_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const enc=new TextEncoder(),dec=new TextDecoder();
function b64urlEncode(b:Uint8Array){let s="";for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64urlDecode(s:string){let t=s.replace(/-/g,"+").replace(/_/g,"/");while(t.length%4)t+="=";const bin=atob(t),o=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)o[i]=bin.charCodeAt(i);return o}
function hexEncode(b:Uint8Array){return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
function hexDecode(h:string){const o=new Uint8Array(h.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(h.slice(i*2,i*2+2),16);return o}
async function hashPassword(pw:string){const salt=crypto.getRandomValues(new Uint8Array(16)),saltHex=hexEncode(salt),key=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);return `pbkdf2$100000$${saltHex}$${hexEncode(new Uint8Array(bits))}`}
async function verifyPassword(pw:string,stored:string){const p=stored.split("$");if(p.length!==4||p[0]!=="pbkdf2")return false;const it=parseInt(p[1],10),saltHex=p[2],hashHex=p[3];if(!saltHex||!hashHex||isNaN(it))return false;try{const salt=hexDecode(saltHex),key=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:it,hash:"SHA-256"},key,256),dh=hexEncode(new Uint8Array(bits));if(dh.length!==hashHex.length)return false;let d=0;for(let i=0;i<dh.length;i++)d|=dh.charCodeAt(i)^hashHex.charCodeAt(i);return d===0}catch{return false}}
async function jwtSign(payload:any,secret:string){const h=b64urlEncode(enc.encode(JSON.stringify({alg:"HS256",typ:"JWT"}))),pp=b64urlEncode(enc.encode(JSON.stringify(payload))),data=`${h}.${pp}`,key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),sig=await crypto.subtle.sign("HMAC",key,enc.encode(data));return `${data}.${b64urlEncode(new Uint8Array(sig))}`}
async function jwtVerify(token:string,secret:string){const parts=token.split(".");if(parts.length!==3)return null;const data=`${parts[0]}.${parts[1]}`;try{const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]),sig=b64urlDecode(parts[2]);if(!await crypto.subtle.verify("HMAC",key,sig,enc.encode(data)))return null;const payload=JSON.parse(dec.decode(b64urlDecode(parts[1])));if(payload.exp&&Date.now()/1000>payload.exp)return null;return payload}catch{return null}}
 function getEnv(k:string,d?:string){const v=Deno.env.get(k);return v===undefined?d??"":v}
const PLANS=["starter","basic","pro","scale"] as const;
type PlanName=typeof PLANS[number];
const PLAN_MONTHLY_TOKENS:Record<PlanName,number|null>={starter:30_000_000,basic:100_000_000,pro:200_000_000,scale:500_000_000};
function planOf(v:any):PlanName|null{const s=String(v||"").toLowerCase();return (PLANS as readonly string[]).includes(s)?(s as PlanName):null}
function planQuota(p:PlanName):number|null{return PLAN_MONTHLY_TOKENS[p]}
const PLAN_RPM:Record<PlanName,number>={starter:120,basic:300,pro:600,scale:1200};
const PLAN_LABEL_FA:Record<PlanName,string>={starter:"استارتر",basic:"بیسیک",pro:"پرو",scale:"اسکیل"};
const PLAN_PRICE_MONTHLY_USD:Record<PlanName,number>={starter:1.2,basic:3.5,pro:5.75,scale:11.5};
function isSupaMisconfigured(){return !(getEnv("SUPABASE_URL")||getEnv("PANEL_SUPABASE_URL"))||!(getEnv("SUPABASE_SERVICE_ROLE")||getEnv("PANEL_SERVICE_ROLE"))}
function supaHeaders(){const k=getEnv("SUPABASE_SERVICE_ROLE")||getEnv("PANEL_SERVICE_ROLE");return{"apikey":k,"Authorization":`Bearer ${k}`,"Content-Type":"application/json"}}
function supaUrl(path:string){if(isSupaMisconfigured()) throw new Error("server misconfiguration");return `${(getEnv("SUPABASE_URL")||getEnv("PANEL_SUPABASE_URL")).replace(/\/+$/,"")}/rest/v1${path}`}
async function sbFetch(path:string,init:RequestInit={}){if(isSupaMisconfigured()) throw new Error("server misconfiguration");const h=new Headers(supaHeaders() as any);if(init.headers)for(const [kk,vv] of Object.entries(init.headers as any))h.set(kk,vv as string);const r=await fetch(supaUrl(path),{...init,headers:h});return r}
async function sbGet(path:string){const r=await sbFetch(path);if(!r.ok)return [];try{return await r.json()}catch{return []}}
async function sbPost(path:string,body:any,prefer="return=representation"){const r=await sbFetch(path,{method:"POST",headers:{"Prefer":prefer},body:JSON.stringify(body)});if(!r.ok){const t=await r.text().catch(()=>"");throw new Error(t)}try{return await r.json()}catch{return []}}
async function sbPatch(path:string,body:any){const r=await sbFetch(path,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());try{return await r.json()}catch{return []}}
async function sbDelete(path:string){const r=await sbFetch(path,{method:"DELETE"});return r.ok}
async function sbRpc(name:string,args:any){const r=await sbFetch(`/rpc/${name}`,{method:"POST",body:JSON.stringify(args)});if(!r.ok)return [];try{const j=await r.json();return Array.isArray(j)?j:[]}catch{return []}}
function logRequest(userId:string|null,keyId:string|null,route:string,method:string,model:string|null,status:number,errorCode:string|null,pt:number,ct:number,latency:number,detail:string|null=null){sbPost("/request_log",{user_id:userId,key_id:keyId,route,method,model,status,error_code:errorCode,prompt_tokens:pt,completion_tokens:ct,latency_ms:latency,detail}).catch((e:any)=>console.error("request_log write failed:",e))}
let adminEnsured=false;
async function ensureAdmin(){if(adminEnsured)return;adminEnsured=true;const email=getEnv("ADMIN_EMAIL"),pw=getEnv("ADMIN_PASSWORD");if(!email||!pw)return;try{const rows=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);if(rows.length>0)return;const h=await hashPassword(pw);await sbPost("/users",{email,name:"Admin",password_hash:h,role:"admin",enabled:true,daily_quota_tokens:0,monthly_quota_tokens:0})}catch{}}
function corsHeaders(){return{"access-control-allow-origin":"*","access-control-expose-headers":"x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, x-codism-saved-tokens"}}
function withCors(h:Headers){if(!h.has("access-control-allow-origin"))h.set("access-control-allow-origin","*");if(!h.has("access-control-expose-headers"))h.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, x-codism-saved-tokens");return h}
function jsonRes(status:number,obj:any,extra?:Record<string,string>){const h=withCors(new Headers({"content-type":"application/json",...(extra||{})}));return new Response(JSON.stringify(obj),{status,headers:h})}
function openaiErr(status:number,msg:string,type="invalid_request_error",code="invalid_request_error"){return jsonRes(status,{error:{message:msg,type,code}})}
function panelErr(status:number,msg:string){return jsonRes(status,{error:msg})}
async function readJson(req:Request):Promise<any>{const cl=req.headers.get("content-length");const lim=maxBodyBytes();if(cl&&parseInt(cl,10)>lim) throw new Error("body_too_large");const t=await req.text();if(t.length>lim) throw new Error("body_too_large");try{return JSON.parse(t)}catch{return {}}}
function getIp(req:Request){const s=getEnv("PANEL_PROXY_SECRET","");if(s&&req.headers.get("x-panel-proxy")===s){const r=req.headers.get("x-panel-real-ip");if(r&&r.trim()) return r.trim()}return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||req.headers.get("x-real-ip")||"0.0.0.0"}
const loginFails=new Map<string,number[]>();
// NOTE: per-isolate best-effort limiting (multi-isolate bypass possible) — acceptable for this scale
const regFails=new Map<string,{count:number,first:number}>();
function isRateLimited(ip:string){const arr=loginFails.get(ip)||[],now=Date.now(),win=5*60*1000;const f=arr.filter(t=>now-t<win);loginFails.set(ip,f);return f.length>=10}
function addFail(ip:string){const a=loginFails.get(ip)||[];a.push(Date.now());loginFails.set(ip,a)}
function resetFail(ip:string){loginFails.delete(ip)}
async function verifyTurnstile(token:string,ip:string){const s=getEnv("TURNSTILE_SECRET","");if(!s) return true;try{const fd=new URLSearchParams({secret:s,response:token,remoteip:ip});const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:fd.toString()});const j=await r.json().catch(()=>null) as any;return !!(j&&j.success)}catch{return false}}
const keyRpm=new Map<string,number[]>();
function isKeyRpmLimited(keyId:string,limit:number){const now=Date.now(),arr=(keyRpm.get(keyId)||[]).filter((t:number)=>now-t<60000);if(arr.length>=limit){keyRpm.set(keyId,arr);return true}arr.push(now);keyRpm.set(keyId,arr);return false}
function parseAliases():Record<string,string>{try{const v=getEnv("MODEL_ALIASES");if(!v)return {};return JSON.parse(v)}catch{return {}}}
function upstreamBase(){return getEnv("UPSTREAM_BASE_URL","https://codecraftapi.com/v1").replace(/\/+$/,"")}
function maxBodyBytes(){return (parseInt(getEnv("MAX_BODY_MB","8"),10)||8)*1024*1024}
const _apmixCache:any={ts:0,v:null,flight:null as any};let _apmixErr:string="";async function getApmixStats(){let v:any=null;try{const ac=new AbortController();const to=setTimeout(()=>ac.abort(),12000);const r=await fetch("https://apmix.ai/api/event",{headers:{accept:"application/json","user-agent":BROWSER_UA},signal:ac.signal});clearTimeout(to);if(!r.ok) throw new Error("mirror_status_"+r.status)
;const j:any=await r.json();v={status:String(j.status||""),model_id:String(j.modelId||""),pool:Number(j.pool)||0,used:Number(j.used)||0,remaining:Number(j.remaining)||0,starts_at:j.startsAt?String(j.startsAt):null,participants:Number(j.participants)||0,requests:Number(j.requests)||0,fetched_at:new Date().toISOString(),via:"json"}}catch{v=null}
if(!v){try{const ac2=new AbortController();const to2=setTimeout(()=>ac2.abort(),15000);const r2=await fetch("https://apmix.ai/event",{headers:{accept:"text/html","user-agent":BROWSER_UA},signal:ac2.signal});clearTimeout(to2);if(r2.ok){const s2=(await r2.text()).replace(/\\"/g,'"');const m2=s2.match(/"status":"(upcoming|live|ended|completed)"[^{}]*?"modelId":"([^"]+)"[^{}]*?"pool":(\d+)[^{}]*?"used":(\d+)[^{}]*?"remaining":(\d+)[^{}]*?"startsAt":"([^"]+)"[^{}]*?"endsAt":(null|"([^"]*)")[^{}]*?"now":"([^"]+)"/);if(m2) v={status:m2[1],model_id:m2[2],pool:Number(m2[3]),used:Number(m2[4]),remaining:Number(m2[5]),starts_at:m2[6],participants:0,requests:0,fetched_at:new Date().toISOString(),via:"html"}}}catch{v=null}}
if(v){_apmixCache.ts=Date.now();_apmixCache.v=v;_apmixErr="";return v}_apmixCache.ts=Date.now();_apmixCache.v=null;_apmixErr="json+html fetch failed";return null}
function apmixNow():Promise<any>{const now=Date.now();if(now-_apmixCache.ts<15000) return Promise.resolve(_apmixCache.v);if(!_apmixCache.flight){_apmixCache.flight=getApmixStats().catch(()=>null).finally(()=>{_apmixCache.flight=null})}let _rt:any=null;const _fb=new Promise((res)=>{_rt=setTimeout(()=>res(_apmixCache.v),8000)});return Promise.race([_apmixCache.flight,_fb]).finally(()=>{if(_rt)clearTimeout(_rt)})}
let _ourUpRow:{id:string|null,ts:number}|null=null;async function ourUpstreamRowId():Promise<string|null>{const now=Date.now();if(_ourUpRow&&_ourUpRow.id&&(now-_ourUpRow.ts<600000)) return _ourUpRow.id;if(_ourUpRow&&!_ourUpRow.id&&(now-_ourUpRow.ts<60000)) return _ourUpRow.id;try{const k=getEnv("UPSTREAM_API_KEY")||"";if(!k){_ourUpRow={id:null,ts:now};return null}const rows=await sbGet(`/upstream_keys?select=id,key`);let id:string|null=null;for(const r of (rows as any[]||[])){if(r&&r.key===k){id=String(r.id);break}}_ourUpRow={id,ts:now};return id}catch{_ourUpRow={id:null,ts:now};return null}}
const _evCache:any={ts:0,v:null};async function getEventState(){
const now=Date.now();if(now-_evCache.ts<15000){const v=_evCache.v;if(v&&v.apmix_sync!==false) return {...v,apmix:_apmixCache.v};return v}try{const ours=await ourUpstreamRowId();const r:any=await sbRpc("event_pool",{p_ours:ours});const row=Array.isArray(r)&&r[0]?r[0]:null;if(!row) throw new Error("empty");const ev={pool_total:Number(row.pool_total),spent:Number(row.spent),spent_ours:Number(row.spent_ours||0),spent_other:Number(row.spent_other||0),model:String(row.model||""),upstream_model:String(row.upstream_model||""),opens_at:row.opens_at,enabled:!!row.enabled,apmix_sync:row.apmix_sync!==false,apmix:(row.apmix_sync===false)?null:(await apmixNow())};_evCache.ts=now;_evCache.v=ev;return ev}catch{ _evCache.ts=Date.now()-12000;_evCache.v=null;return null}}
function eventStatusOf(ev:any,nowMs:number){if(!ev||!ev.enabled) return "disabled";const ap=ev.apmix||null;if(ap){const apRem=Number(ap.remaining);if(ap.status==="ended"||(Number.isFinite(apRem)&&apRem<=0)) return "ended";const rem=(Number(ev.pool_total)||0)-(Number(ev.spent)||0);if(rem<=0) return "ended";if(ap.status==="live") return "live";return "scheduled"}const t=ev.opens_at?Date.parse(ev.opens_at):NaN;if(isNaN(t)) return "disabled";if(nowMs<t) return "scheduled";const rem=(Number(ev.pool_total)||0)-(Number(ev.spent)||0);if(rem<=0) return "ended";return "live"}
function invalidateEventCache(){_evCache.ts=0;_evCache.v=null;_apmixCache.ts=0;_apmixCache.flight=null}
const COMBO_PREFIX="combo/";
const TOKEN_SAVER_SYSTEM="You are a token-efficient assistant. Answer concisely and directly: no preamble, no filler, no restating the question. Prefer the shortest complete correct answer. Keep code minimal but functional.";
const PRICE_PER_MTOK:Record<string,[number,number]>={"claude-opus":[5,25],"claude-sonnet":[3,15],"claude-haiku":[1,5],"claude":[3,15],"gpt-5":[2.5,10],"gpt":[2.5,10],"gemini":[1.25,5],"glm":[0.6,2],"deepseek":[0.3,1.2],"qwen":[0.8,3],"grok":[3,15],"kimi":[0.6,2.5],"seed":[0.3,1.2],"muse":[0.3,1.2],"gemma":[0.1,0.3]};
function estCost(model:string,pt:number,ct:number):number{const m=String(model||"").toLowerCase();let p:[number,number]=[1,3];for(const k of Object.keys(PRICE_PER_MTOK)){if(m.includes(k)){p=PRICE_PER_MTOK[k];break}}return ((pt*p[0])+(ct*p[1]))/1e6}
  const GROK_MODEL_COST:Record<string,[number,number]>={"grok-4.7":[2,6],"grok-4.6":[2,6],"grok-4.5":[3,15],"grok-4.20":[1.25,2.5],"grok-4.3":[1.25,2.5],"grok-build-0.1":[1,2],"grok-4-fast":[0.2,0.5],"grok-4":[3,15],"grok-3-mini":[0.6,4],"grok-3":[3,15]};
  const QUOTA_REF_USD_PER_MTOK=0.04; // internal quota unit value: starter plan $1.2 / 30M tokens
  function quotaTokens(model:string,pt:number,ct:number):number{const m=String(model||"").toLowerCase();const P=Math.max(0,Math.ceil(Number(pt)||0)),C=Math.max(0,Math.ceil(Number(ct)||0));if(!m.includes("grok"))return P+C;let best:[number,number]|null=null;let blen=0;for(const k of Object.keys(GROK_MODEL_COST)){if(m===k||m.startsWith(k+"/"))return Math.ceil((P*GROK_MODEL_COST[k][0]+C*GROK_MODEL_COST[k][1])/QUOTA_REF_USD_PER_MTOK);if(m.startsWith(k)&&k.length>blen){best=GROK_MODEL_COST[k];blen=k.length}}if(!best){for(const k of Object.keys(PRICE_PER_MTOK)){if(m.includes(k)){best=PRICE_PER_MTOK[k];break}}}if(!best)return P+C;return Math.ceil((P*best[0]+C*best[1])/QUOTA_REF_USD_PER_MTOK)}
type ChainStep={upstream_key_id:string|null,model:string};
function trimBigText(s:string):string{let t=s.replace(/[ \t]+$/gm,"").replace(/\n{3,}/g,"\n\n");if(t.length>24000)t=t.slice(0,24000)+`\n…[truncated ${t.length-24000} chars]`;return t}
function applyTokenSaver(body:any,level:string):{body:any,savedChars:number}{
 let b:any;try{b=JSON.parse(JSON.stringify(body))}catch{return {body,savedChars:0}}
 let saved=0;
 if(Array.isArray(b.messages)){
  for(const m of b.messages){
   if(!m)continue;
   if(typeof m.content==="string"&&m.content){const before=m.content.length;m.content=trimBigText(m.content);saved+=before-m.content.length}
   else if(Array.isArray(m.content)){for(const part of m.content){if(part&&typeof part.text==="string"&&part.text){const before=part.text.length;part.text=trimBigText(part.text);saved+=before-part.text.length}}}
  }
 }
 if(level==="turbo"&&Array.isArray(b.messages)){
  const idx=b.messages.findIndex((m:any)=>m&&m.role==="system");
  if(idx>=0){if(typeof b.messages[idx].content==="string"&&!String(b.messages[idx].content).includes("token-efficient"))b.messages[idx].content=TOKEN_SAVER_SYSTEM+"\n\n"+b.messages[idx].content}
  else b.messages.unshift({role:"system",content:TOKEN_SAVER_SYSTEM});
 }
 return {body:b,savedChars:Math.max(0,saved)}
}
async function loadChain(rawModel:string,expandedModel:string,userUpKeyId:string|null):Promise<{steps:ChainStep[]}|{error:string}>{
 if(typeof rawModel==="string"&&rawModel.startsWith(COMBO_PREFIX)){
  const cname=rawModel.slice(COMBO_PREFIX.length).trim().toLowerCase();
  if(!cname)return{error:"model_not_allowed"};
  const rows=await sbGet(`/combos?name=eq.${encodeURIComponent(cname)}&enabled=eq.true&select=name,steps`);
  if(!rows[0])return{error:"model_not_allowed"};
  let steps:ChainStep[]=[];
  try{steps=(rows[0].steps||[]).filter((s:any)=>s&&typeof s.model==="string"&&s.model.trim()).map((s:any)=>({upstream_key_id:s.upstream_key_id?String(s.upstream_key_id):null,model:String(s.model).trim()}))}catch{}
  if(!steps.length)return{error:"model_not_allowed"};
  return{steps};
 }
 const steps:ChainStep[]=[{upstream_key_id:userUpKeyId,model:expandedModel}];
 try{
  const dc=await sbGet(`/combos?is_default=eq.true&enabled=eq.true&select=steps&limit=1`);
  const ds=Array.isArray(dc)&&dc[0]&&Array.isArray(dc[0].steps)?dc[0].steps:[];
  for(const s of ds){if(!s||typeof s.model!=="string"||!s.model.trim())continue;const st:ChainStep={upstream_key_id:s.upstream_key_id?String(s.upstream_key_id):null,model:String(s.model).trim()};if(!steps.some(x=>x.model===st.model&&(x.upstream_key_id||null)===(st.upstream_key_id||null)))steps.push(st)}
 }catch{}
 return{steps};
}
async function resolveUpstream(step:ChainStep):Promise<{key:string,base:string,label:string}|null>{
 if(step.upstream_key_id){
  const ks=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(step.upstream_key_id)}&select=key,enabled,base_url,label`);
  if(!ks[0]||!ks[0].enabled)return null;
  const b=(ks[0].base_url||"").trim().replace(/\/+$/,"");
  return{key:ks[0].key,base:b||upstreamBase(),label:ks[0].label||"upstream"};
 }
 const d=await getDefaultUpstream();
 if(d) return{key:d.key,base:d.base||upstreamBase(),label:d.label||"default"};
 return{key:getEnv("UPSTREAM_API_KEY")||getEnv("PANEL_UPSTREAM_KEY")||"",base:upstreamBase(),label:"default"};
}
let __defUpCache:{ts:number,row:{key:string,base:string,label:string}|null}|null=null;
async function getDefaultUpstream(){const n=Date.now();if(__defUpCache&&n-__defUpCache.ts<60000) return __defUpCache.row;let row:{key:string,base:string,label:string}|null=null;try{const rows=await sbGet(`/upstream_keys?is_default=eq.true&enabled=eq.true&select=key,base_url,label&limit=1`);if(rows[0]&&rows[0].key) row={key:rows[0].key,base:String(rows[0].base_url||"").replace(/\/+$/,"") as string,label:rows[0].label||"default"}}catch{}__defUpCache={ts:n,row};return row}
let __evUpRowCache:{ts:number,row:{id:string,label:string}|null}|null=null;
async function getEventUpstreamRow(){const n=Date.now();if(__evUpRowCache&&n-__evUpRowCache.ts<60000) return __evUpRowCache.row;let row:{id:string,label:string}|null=null;try{const eid=getEnv("EVENT_UPSTREAM_ID","").trim();let rows:any[]=[];if(eid) rows=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(eid)}&enabled=eq.true&select=id,label`);if(!rows.length) rows=await sbGet(`/upstream_keys?enabled=eq.true&base_url=ilike.*apmix.ai*&select=id,label&limit=1`);if(rows[0]) row={id:String(rows[0].id),label:String(rows[0].label||"event")};}catch{}__evUpRowCache={ts:n,row};return row}
let __grokUpCache:{ts:number,row:{id:string,key:string,base:string,label:string}|null}|null=null;let __grokModelsCache:{ts:number,data:string[]}|null=null;const STATIC_GROK_CHAT=["grok-4.7","grok-4.6","grok-4.5","grok-4.20","grok-4.3","grok-build-0.1"];async function getGrokUpstream(){const n=Date.now();if(__grokUpCache&&n-__grokUpCache.ts<60000)return __grokUpCache.row;let row:{id:string,key:string,base:string,label:string}|null=null;try{const eid=getEnv("GROK_UPSTREAM_ID","").trim();let rows:any[]=[];if(eid)rows=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(eid)}&select=id,key,base_url,label`);if(!rows.length)rows=await sbGet(`/upstream_keys?enabled=eq.true&base_url=ilike.*api.x.ai*&select=id,key,base_url,label&limit=1`);const x=rows[0];if(x&&x.key)row={id:String(x.id),key:String(x.key),base:(String(x.base_url||"").trim().replace(/\/+$/,"")||upstreamBase()),label:String(x.label||"grok")}}catch{}__grokUpCache={ts:n,row};return row}function mediaQuotaTokens(usd:number){return Math.round((Number(usd)||0)*25000000)}function pgGateReason(db:any){if(db.role==="admin")return null;if(!planOf(db.plan))return "no_active_plan";if(db.subscription_expires_at&&Date.now()>Date.parse(String(db.subscription_expires_at)))return "subscription_expired";return null}
let __poolModelsCache:{ts:number,data:ModelInfo[]}|null=null;async function poolModels():Promise<ModelInfo[]>{const n=Date.now();if(__poolModelsCache&&n-__poolModelsCache.ts<300000) return __poolModelsCache.data;let out:ModelInfo[]=[];try{const pools=await sbGet(`/upstream_keys?enabled=eq.true&select=key,base_url&limit=8`);const list=(Array.isArray(pools)?pools:[]).filter((p:any)=>p&&p.key&&p.base_url).slice(0,5);if(list.length){const rs=await Promise.all(list.map(async(p:any)=>{const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),4000);try{const r=await fetch(String(p.base_url).replace(/\/+$/,"")+"/models",{headers:{"Authorization":`Bearer ${String(p.key)}`,"User-Agent":BROWSER_UA},signal:ctrl.signal});if(!r.ok)return[];const j=await r.json().catch(()=>null) as any;const arr=j&&typeof j==="object"?(j.data||j.models||j):null;if(!Array.isArray(arr))return[];return arr.map((m:any)=>{const id=String(m&&m.id||m&&m.name||"");if(!id)return null;const meta=modelMeta(id);if(typeof m.context_length==="number")meta.context=m.context_length;else if(typeof m.context==="number")meta.context=m.context;else if(typeof m.max_tokens==="number")meta.context=m.max_tokens;return meta}).filter(Boolean) as ModelInfo[]}catch{return[]}finally{clearTimeout(to)}}));const seen=new Set<string>();for(const arr of rs)for(const m of arr){if(m&&m.id&&!seen.has(m.id)){seen.add(m.id);out.push(m)}}}}catch{}__poolModelsCache={ts:n,data:out};return out}
const TZ_OFF_MIN=210;
function todayBounds(){const n=new Date(Date.now()+TZ_OFF_MIN*60000);const s=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),0,0,0)-TZ_OFF_MIN*60000);const e=new Date(s.getTime()+86400000);return[s.toISOString(),e.toISOString()]}
function monthBounds(){const n=new Date(Date.now()+TZ_OFF_MIN*60000);const s=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),1,0,0,0)-TZ_OFF_MIN*60000);const e=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,1,0,0,0)-TZ_OFF_MIN*60000);return[s.toISOString(),e.toISOString()]}
async function getAuthPayload(req:Request){const a=req.headers.get("authorization")||req.headers.get("Authorization")||"";if(!a.toLowerCase().startsWith("bearer "))return null;const t=a.slice(7).trim();if(!t)return null;if(t.startsWith("codism_"))return null;const sec=getEnv("JWT_SECRET");if(!sec)return null;return await jwtVerify(t,sec)}
async function requireJwt(req:Request){const p=await getAuthPayload(req);if(!p)return null;return p}
function normalizePath(p:string){let s=p;const prefixes=["/functions/v1/panel","/panel"];for(const pre of prefixes){if(s===pre||s.startsWith(pre+"/")){let rest=s.slice(pre.length)||"/";if(!rest.startsWith("/"))rest="/"+rest;s=rest;break}}if(!s.startsWith("/"))s="/"+s;return s}
function stripTrailing(p:string){if(p.length>1&&p.endsWith("/"))return p.slice(0,-1);return p}
// UI moved to GitHub Pages (ui-src/ -> gh-pages). This function is API-only; GET / redirects to PANEL_UI_URL.


Deno.serve(async (req:Request)=>{
 try{
 if(!getEnv("JWT_SECRET")||getEnv("JWT_SECRET").length<16) console.error("JWT_SECRET missing/short — logins will fail");
 await ensureAdmin();
 const url=new URL(req.url);
 let pathname=normalizePath(url.pathname);
 const method=req.method;
 // CORS preflight
 if(method==="OPTIONS"){
  const h=new Headers();
  h.set("access-control-allow-origin","*");
  h.set("access-control-allow-methods","GET, POST, OPTIONS, PATCH, DELETE");
  h.set("access-control-allow-headers","authorization, content-type, x-api-key, x-requested-with, x-codism-token-saver");
  h.set("access-control-max-age","86400");
  h.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, x-codism-saved-tokens");
  return new Response(null,{status:204,headers:h});
 }
 const norm=stripTrailing(pathname);
{const _ps=getEnv("PANEL_PROXY_SECRET","");if(_ps){const _ph=req.headers.get("x-panel-proxy")||"";if(_ph!==_ps){if(!(method==="OPTIONS"||(norm==="/health"&&method==="GET")||(norm==="/"&&(method==="GET"||method==="HEAD")))) return panelErr(403,"origin_lock")}}}
type ModelCaps={reasoning:boolean,tools:boolean,vision:boolean,json:boolean,web:boolean};
type ModelInfo={id:string,provider:string,capabilities:ModelCaps,context:number};
const STATIC_FALLBACK_MODELS:ModelInfo[]=[
 {id:"claude-fable-5",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-fable-5.1",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-mythos-preview",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-opus-4.6",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-opus-4.7",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-opus-4.8",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-opus-5",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-opus-5.5",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"claude-sonnet-5",provider:"anthropic",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:200000},
 {id:"deepseek-v4-flash-0731",provider:"deepseek",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:163840},
 {id:"deepseek-v4-pro-0813",provider:"deepseek",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:163840},
 {id:"deepseek-v4-pro-max",provider:"deepseek",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:163840},
 {id:"gemini-3.1-pro",provider:"google",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:1000000},
 {id:"gemini-3.6-flash",provider:"google",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:1000000},
 {id:"gemini-3.7-flash",provider:"google",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:1000000},
 {id:"gemma-2-2b",provider:"google",capabilities:{reasoning:false,tools:false,vision:false,json:true,web:false},context:8192},
 {id:"glm-5.2",provider:"zhipu",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:200000},
 {id:"glm-5.3",provider:"zhipu",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:200000},
 {id:"gpt-5.5",provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:400000},
 {id:"gpt-5.5-pro",provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:400000},
 {id:"gpt-5.6-luna",provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:400000},
 {id:"gpt-5.6-sol",provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:400000},
 {id:"gpt-5.6-terra",provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:400000},
 {id:"grok-4.5",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:256000},
 {id:"grok-4.6",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:256000},
 {id:"grok-4.7",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:500000},
 {id:"grok-4.20",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:256000},
 {id:"grok-4.3",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:256000},
 {id:"grok-build-0.1",provider:"xai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:256000},

 {id:"kimi-k2.6",provider:"moonshot",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:262144},
 {id:"kimi-k3",provider:"moonshot",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:262144},
 {id:"muse-spark-1.1",provider:"bytedance",capabilities:{reasoning:false,tools:true,vision:false,json:true,web:false},context:128000},
 {id:"qwen3.7-max",provider:"qwen",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:262144},
 {id:"qwen3.8-27b",provider:"qwen",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:262144},
 {id:"qwen3.8-max",provider:"qwen",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:262144},
 {id:"seed-2.1-pro",provider:"bytedance",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:262144},
 {id:"seed-2.1-turbo",provider:"bytedance",capabilities:{reasoning:true,tools:true,vision:false,json:true,web:false},context:262144},
];
function modelMeta(id:string):ModelInfo{
  const f=STATIC_FALLBACK_MODELS.find(m=>m.id===id);
  if(f) return f;
  const lower=id.toLowerCase();
  let provider="openai";
  if(lower.includes("claude")) provider="anthropic";
  else if(lower.includes("gemini")) provider="google";
  else if(lower.includes("deepseek")) provider="deepseek";
  else if(lower.includes("qwen")) provider="qwen";
  else if(lower.includes("llama")) provider="meta";
  else if(lower.includes("moonshot")||lower.includes("kimi")) provider="moonshot";
  else if(lower.includes("glm")||lower.includes("zhipu")) provider="zhipu";
  else if(lower.includes("doubao")) provider="bytedance";
  else if(lower.includes("mistral")) provider="mistral";
  else if(lower.includes("grok")) provider="xai";
  else if(lower.includes("seed")||lower.includes("muse")) provider="bytedance";
  else if(lower.includes("gpt")) provider="openai";
  else if(lower.includes("fable")||lower.includes("mythos")||lower.includes("opus")||lower.includes("sonnet")) provider="anthropic";
  return {id,provider,capabilities:{reasoning:false,tools:true,vision:false,json:true,web:false},context:128000};
}
if(norm==="/api/models"&&req.method==="GET"){
  const now=Date.now();
  const g=(globalThis as any);
  if(g.__codismModelsCache&&now-g.__codismModelsCache.ts<30*60*1000){
    return jsonRes(200,{data:g.__codismModelsCache.data});
  }
  if(g.__codismModelsPromise){await g.__codismModelsPromise;return jsonRes(200,{data:g.__codismModelsCache.data})}
  g.__codismModelsPromise=(async()=>{})().catch(()=>{});
  try{
    const allowedRaw=getEnv("ALLOWED_MODELS","");
    const allowedSet:Set<string>|null=allowedRaw?new Set(allowedRaw.split(",").map((s:string)=>s.trim()).filter(Boolean)):null;
    let upstreamModels:ModelInfo[]|null=null;
    const base=upstreamBase();
    const key=getEnv("UPSTREAM_API_KEY")||getEnv("PANEL_UPSTREAM_KEY")||"";
    if(base&&key){
      const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),4000);
      try{
        const r=await fetch(`${base}/models`,{headers:{"Authorization":`Bearer ${key}`,"User-Agent":BROWSER_UA},signal:ctrl.signal});
        if(r.ok){
          const j=await r.json().catch(()=>null) as any;
          const arr=j?.data||j?.models||j;
          if(Array.isArray(arr)){
            upstreamModels=(arr.map((m:any)=>{
              const id=String(m.id||m.name||"");
              if(!id) return null;
              const meta=modelMeta(id);
              if(typeof m.context_length==="number") meta.context=m.context_length;
              else if(typeof m.context==="number") meta.context=m.context;
              else if(typeof m.max_tokens==="number") meta.context=m.max_tokens;
              return meta;
            }).filter(Boolean) as ModelInfo[]);
          }
        }
      }catch{}finally{clearTimeout(to)}
    }
    let data:ModelInfo[]=upstreamModels&&upstreamModels.length?upstreamModels:STATIC_FALLBACK_MODELS.slice();
    if(allowedSet) data=data.filter(m=>allowedSet.has(m.id));
    try{const pm=await poolModels();if(pm.length){const _s=new Set(data.map(m=>m.id));for(const m of pm){if(!_s.has(m.id)&&(!allowedSet||allowedSet.has(m.id))){data.push(m);_s.add(m.id)}}}}catch{}
    const aliases=parseAliases();
    const aliasKeys=Object.keys(aliases);
    if(aliasKeys.length){
      const seen=new Set(data.map(m=>m.id));
      for(const aid of aliasKeys){
        if(!seen.has(aid)&&(!allowedSet||allowedSet.has(aid))){
          data.push(modelMeta(aid));
          seen.add(aid);
        }
      }
    }
    try{const ev=await getEventState();if(ev&&eventStatusOf(ev,Date.now())==="live"&&!data.some((m:ModelInfo)=>m.id===ev.model)) data.push({id:ev.model,provider:"openai",capabilities:{reasoning:true,tools:true,vision:true,json:true,web:false},context:1050000})}catch{}
    g.__codismModelsCache={ts:now,data};delete g.__codismModelsPromise;
    return jsonRes(200,{data});
  }catch{
    return jsonRes(200,{data:STATIC_FALLBACK_MODELS});
  }
}
if(norm==="/api/status"&&req.method==="GET"){
  const now=Date.now();
  const g2=(globalThis as any);
  if(g2.__codismStatusCache&&now-g2.__codismStatusCache.ts<5*60*1000){
    return jsonRes(200,g2.__codismStatusCache.payload);
  }
  const start=Date.now();
  let ok=true;let latency_ms=0;
  try{
    const base=upstreamBase();
    const key=getEnv("UPSTREAM_API_KEY")||getEnv("PANEL_UPSTREAM_KEY")||"";
    const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),4000);
    try{
      const r=await fetch(`${base}/models`,{method:"GET",headers:{...(key?{"Authorization":`Bearer ${key}`}:{}),"User-Agent":BROWSER_UA},signal:ctrl.signal});
      ok=r.ok;
    }catch{ok=false}finally{clearTimeout(to);latency_ms=Date.now()-start}
  }catch{ok=false;latency_ms=Date.now()-start}
  const payload={ok:true,registration_open:getEnv("REGISTRATION_OPEN","true").toLowerCase().trim()!=="false",turnstile_site_key:getEnv("TURNSTILE_SITE_KEY",""),upstream:{ok,latency_ms,checked_at:new Date().toISOString()}};
  g2.__codismStatusCache={ts:now,payload};
  return jsonRes(200,payload);
}
 if(norm==="/api/event"&&method==="GET"){const ev=await getEventState();const nowMs=Date.now();const nowIso=new Date(nowMs).toISOString();if(!ev||eventStatusOf(ev,nowMs)==="disabled") return jsonRes(200,{ok:true,status:"disabled",event:null,model:null,pool_total:null,pool_spent:null,pool_remaining:null,opens_at:null,mirror:null,mirror_err:_apmixErr||null,now:nowIso});

const st=eventStatusOf(ev,nowMs);const rem=Math.max(0,(Number(ev.pool_total)||0)-(Number(ev.spent)||0));return jsonRes(200,{ok:true,status:st,event:{model:ev.model,pool_total:ev.pool_total,pool_spent:ev.spent,pool_remaining:rem,opens_at:ev.opens_at,mirror:ev.apmix||null},model:ev.model,pool_total:ev.pool_total,pool_spent:ev.spent,pool_remaining:rem,opens_at:ev.opens_at,mirror:ev.apmix||null,mirror_err:(ev.apmix?null:(_apmixErr||"unset")),now:nowIso});

}
 // health
 if(norm==="/health"&&method==="GET") return jsonRes(200,{ok:true,service:"codism-panel"});
 if(norm==="/"&&(method==="GET"||method==="HEAD")) return new Response(null,{status:302,headers:withCors(new Headers({location:getEnv("PANEL_UI_URL","https://pvwvuow.github.io/codism/"),"cache-control":"no-store"}))});
 function isRegRateLimited(ip:string){const e=regFails.get(ip);if(!e) return false;if(Date.now()-e.first>3600000){regFails.delete(ip);return false}return e.count>=5}
 function addRegFail(ip:string){const now=Date.now();const e=regFails.get(ip);if(!e||now-e.first>3600000) regFails.set(ip,{count:1,first:now});else e.count++}
 function resetRegFail(ip:string){regFails.delete(ip)}
 // register
 if(norm==="/api/auth/register"&&method==="POST"){
  if(getEnv("REGISTRATION_OPEN","true")==="false") return jsonRes(403,{error:"registration_closed",code:"registration_closed"});
  const ip=getIp(req);
  if(isRegRateLimited(ip)) return panelErr(429,"Too many attempts");
  let body:any;try{body=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");body={}}
  const email=(body.email||"").trim(),password=body.password||"",name=(body.name||"").trim();
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length<8||password.length>200||!name||name.length<2||name.length>100||(body.phone&&String(body.phone).length>20)) return jsonRes(400,{error:"validation_error",code:"validation_error"});
 {const _tsec=getEnv("TURNSTILE_SECRET","");if(_tsec){const _tok=(body.turnstile_token||"").trim();if(!_tok||!await verifyTurnstile(_tok,ip)) return jsonRes(400,{error:"turnstile_failed",code:"turnstile_failed"})}}
  const ex=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);
  if(ex.length){addRegFail(ip);return jsonRes(409,{error:"email_exists",code:"email_exists"})}
  const h=await hashPassword(password);
  const plan="none";
  const mq=0;
  let ins:any;try{ins=await sbPost("/users",{email,name,password_hash:h,role:"user",enabled:true,plan,daily_quota_tokens:0,monthly_quota_tokens:mq,phone:body.phone||null})}catch(e:any){console.error("register insert failed:",String(e.message||e));const msg=String(e.message||"");if(msg.includes("duplicate")||msg.includes("23505")||msg.includes("already exists")){addRegFail(ip);return jsonRes(409,{error:"email_exists",code:"email_exists"})}return jsonRes(400,{error:"create_failed",code:"create_failed"})}
  const user=ins[0];
  resetRegFail(ip);
  const exp=Math.floor(Date.now()/1000)+12*3600;
  const token=await jwtSign({sub:user.id,email:user.email,role:user.role,exp},getEnv("JWT_SECRET"));
  return jsonRes(201,{token,user:{id:user.id,email:user.email,name:user.name,role:user.role,plan:user.plan||plan,daily_quota_tokens:user.daily_quota_tokens,monthly_quota_tokens:user.monthly_quota_tokens}});
 }
 // login
 if(norm==="/api/auth/login"&&method==="POST"){
  const ip=getIp(req);
  if(isRateLimited(ip)) return panelErr(429,"Too many attempts");
  let body:any;try{body=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");body={}}
  const email=(body.email||"").trim(),password=body.password||"";
  if(!email||!password) return panelErr(400,"email & password required");
  const rows=await sbGet(email.includes("@")?`/users?email=eq.${encodeURIComponent(email)}&select=id,email,name,password_hash,role,enabled,daily_quota_tokens,monthly_quota_tokens,username,subscription_expires_at`:`/users?username=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=id,email,name,password_hash,role,enabled,daily_quota_tokens,monthly_quota_tokens,username,subscription_expires_at`);
  const user=rows[0];
  if(!user){addFail(ip);return panelErr(401,"Invalid credentials")}
  if(!user.enabled){addFail(ip);return panelErr(403,"Account disabled")}
  const ok=await verifyPassword(password,user.password_hash);
  if(!ok){addFail(ip);return panelErr(401,"Invalid credentials")}
  resetFail(ip);
  const exp=Math.floor(Date.now()/1000)+12*3600;
  const token=await jwtSign({sub:user.id,email:user.email,role:user.role,exp},getEnv("JWT_SECRET"));
  return jsonRes(200,{token,user:{id:user.id,email:user.email,name:user.name,role:user.role,daily_quota_tokens:user.daily_quota_tokens,monthly_quota_tokens:user.monthly_quota_tokens,username:user.username,subscription_expires_at:user.subscription_expires_at}});
 }
 // helper to auth
 async function authOr401():Promise<any>{
  const p=await requireJwt(req);
  if(!p) return null;
  // verify user still enabled
  const rows=await sbGet(`/users?id=eq.${encodeURIComponent(p.sub)}&select=id,email,name,role,enabled,plan,daily_quota_tokens,monthly_quota_tokens,username,subscription_expires_at,upstream_key_id`);

  if(!rows[0]||!rows[0].enabled) return null;
  return {...p,db:rows[0]};
 }
 if(norm==="/api/auth/password"&&method==="POST"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
  const cur=b.current_password||b.currentPassword||"",nw=b.new_password||b.newPassword||"";
  if(!nw||nw.length<8) return jsonRes(400,{error:"validation_error",code:"validation_error"});
  const rows=await sbGet(`/users?id=eq.${encodeURIComponent(a.sub)}&select=id,password_hash`);
  const u=rows[0];
  if(!u) return panelErr(401,"Unauthorized");
  const ok=await verifyPassword(cur,u.password_hash);
  if(!ok) return jsonRes(401,{error:"invalid_credentials",code:"invalid_credentials"});
  const h=await hashPassword(nw);
  await sbPatch(`/users?id=eq.${encodeURIComponent(a.sub)}`,{password_hash:h});
  return jsonRes(200,{ok:true});
 }
 if(norm==="/api/auth/profile"&&method==="POST"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
  const curRows=await sbGet(`/users?id=eq.${encodeURIComponent(a.sub)}&select=email,username`);const cur=curRows[0]||{};
  const p:any={};let em:any=undefined,un:any=undefined;
  if(b.name!==undefined){const v=String(b.name).trim();if(v.length<2||v.length>100) return jsonRes(400,{error:"validation_error",code:"validation_error"});p.name=v;}
  if(b.email!==undefined){if(b.email===""){p.email=null;em=null;}else{const v=String(b.email).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return jsonRes(400,{error:"validation_error",code:"validation_error"});const ex=await sbGet(`/users?email=eq.${encodeURIComponent(v)}&id=neq.${encodeURIComponent(a.sub)}&select=id`);if(ex.length) return jsonRes(409,{error:"email_exists",code:"email_exists"});p.email=v;em=v;}}
  if(b.username!==undefined){if(b.username===""){p.username=null;un=null;}else{const v=String(b.username).trim().toLowerCase();if(!/^[a-z0-9_-]{3,32}$/.test(v)) return jsonRes(400,{error:"validation_error",code:"validation_error"});const ex=await sbGet(`/users?username=eq.${encodeURIComponent(v)}&id=neq.${encodeURIComponent(a.sub)}&select=id`);if(ex.length) return jsonRes(409,{error:"username_exists",code:"username_exists"});p.username=v;un=v;}}
  const finalEmail=em!==undefined?em:cur.email;const finalUsername=un!==undefined?un:cur.username;if(!finalEmail&&!finalUsername) return jsonRes(400,{error:"validation_error",code:"validation_error"});
  if(!Object.keys(p).length) return jsonRes(400,{error:"validation_error",code:"validation_error"});
  await sbPatch(`/users?id=eq.${encodeURIComponent(a.sub)}`,p);
  const rows=await sbGet(`/users?id=eq.${encodeURIComponent(a.sub)}&select=id,email,username,name,role,plan,daily_quota_tokens,monthly_quota_tokens,subscription_expires_at`);return jsonRes(200,{ok:true,user:rows[0]});
 }
 // /api/me
 if(norm==="/api/me"&&method==="GET"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const [tFrom,tTo]=todayBounds(),[mFrom,mTo]=monthBounds();
  const [todayRows,monthRows]=await Promise.all([sbRpc("usage_sum",{p_user:a.sub,p_from:tFrom,p_to:tTo}),sbRpc("usage_sum",{p_user:a.sub,p_from:mFrom,p_to:mTo})]);
  const tr=todayRows[0]||{prompt_tokens:0,completion_tokens:0,requests:0},mr=monthRows[0]||{prompt_tokens:0,completion_tokens:0,requests:0};
  return jsonRes(200,{user:a.db,today:tr,month:mr});
 }
 // /api/keys
 if(norm==="/api/keys"&&method==="GET"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const rows=await sbGet(`/api_keys?user_id=eq.${encodeURIComponent(a.sub)}&select=id,label,key,enabled,models,token_saver,debug,created_at&order=created_at.desc`);
  return jsonRes(200,rows);
 }
 if(norm==="/api/keys"&&method==="POST"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
  let label=(b.label||"").trim();
  let models="*";
  if(typeof b.models==="string"){
   models=b.models.trim().slice(0,200);
   if(models!=="*"){
    if(!models) return panelErr(400,"invalid models");
    const toks=models.split(",").map((s:string)=>s.trim()).filter(Boolean);
    if(toks.length===0) return panelErr(400,"invalid models");
    const re=/^[A-Za-z0-9._\/\-\*]+$/;
    for(const t of toks) if(!re.test(t)) return panelErr(400,"invalid models");
    models=toks.join(",");
   }
  } else if(b.models!==undefined&&b.models!==null){
   return panelErr(400,"invalid models");
  }
  let tokenSaver="off";if(b.token_saver!==undefined&&b.token_saver!==null){tokenSaver=String(b.token_saver).trim().toLowerCase();if(!["off","trim","turbo"].includes(tokenSaver)) return panelErr(400,"invalid token_saver")}
  const active=await sbGet(`/api_keys?user_id=eq.${encodeURIComponent(a.sub)}&enabled=eq.true&select=id`);
  if(active.length>=10) return panelErr(429,"max 10 active keys");
  const rand=hexEncode(crypto.getRandomValues(new Uint8Array(16)));
  const key="codism_"+rand;
  if(!label) label="کلید "+rand.slice(0,4);
  const ins=await sbPost("/api_keys",{user_id:a.sub,key,label,enabled:true,models,token_saver:tokenSaver});
  return jsonRes(200,ins[0]||{key});
 }
 if(pathname.startsWith("/api/keys/")&&method==="DELETE"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const id=pathname.split("/")[3];
  const rows=await sbGet(`/api_keys?id=eq.${encodeURIComponent(id)}&select=id,user_id`);
  if(!rows[0]) return panelErr(404,"not found");
  if(rows[0].user_id!==a.sub) return panelErr(403,"forbidden");
  await sbDelete(`/api_keys?id=eq.${encodeURIComponent(id)}`);
  return jsonRes(200,{ok:true});
 }
 if(pathname.startsWith("/api/keys/")&&method==="PATCH"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const id=pathname.split("/")[3];
  let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
  const rows=await sbGet(`/api_keys?id=eq.${encodeURIComponent(id)}&select=id,user_id`);
  if(!rows[0]) return panelErr(404,"not found");
  if(rows[0].user_id!==a.sub) return panelErr(403,"forbidden");
  const patch:any={};
  if(b.label!==undefined){const label=String(b.label).trim();if(!label||label.length>80) return panelErr(400,"invalid label");patch.label=label}
  if(b.token_saver!==undefined){const ts=String(b.token_saver||"off").trim().toLowerCase();if(!["off","trim","turbo"].includes(ts)) return panelErr(400,"invalid token_saver");patch.token_saver=ts}
  if(b.debug!==undefined) patch.debug=!!b.debug;
  if(b.models!==undefined){if(b.models===null||(Array.isArray(b.models)&&b.models.length===0)) patch.models=null;else if(Array.isArray(b.models)){const n:string[]=[];for(const m of b.models){const s=String(m).trim();if(!s||s.length>120) return panelErr(400,"invalid models");n.push(s)}patch.models=n.join(",")}else return panelErr(400,"invalid models")}
  if(Object.keys(patch).length===0) return panelErr(400,"no fields");

  await sbPatch(`/api_keys?id=eq.${encodeURIComponent(id)}`,patch);
  return jsonRes(200,{ok:true});
 }
 // /api/usage
 if(norm==="/api/usage"&&method==="GET"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const days=Math.min(90,Math.max(1,parseInt(url.searchParams.get("days")||"14",10)||14));
  const [tFrom,tTo]=todayBounds(),[mFrom,mTo]=monthBounds();
  const [by,td,mo,bm]=await Promise.all([sbRpc("usage_by_day",{p_user:a.sub,p_days:days,p_offset_min:TZ_OFF_MIN}),sbRpc("usage_sum",{p_user:a.sub,p_from:tFrom,p_to:tTo}),sbRpc("usage_sum",{p_user:a.sub,p_from:mFrom,p_to:mTo}),sbRpc("usage_by_model",{p_user:a.sub,p_days:days,p_offset_min:TZ_OFF_MIN})]);
  const recent=await sbGet(`/request_log?user_id=eq.${encodeURIComponent(a.sub)}&select=ts,route,model,status,error_code,prompt_tokens,completion_tokens,latency_ms&order=ts.desc&limit=25`);
  let estCostUsd=0;for(const r of (Array.isArray(bm)?bm:[])) estCostUsd+=estCost(String(r.model||""),Number(r.prompt_tokens)||0,Number(r.completion_tokens)||0);
  return jsonRes(200,{by_day:by,by_model:bm,today:td[0]||{prompt_tokens:0,completion_tokens:0,requests:0},month:mo[0]||{prompt_tokens:0,completion_tokens:0,requests:0,saved_tokens:0},recent,est_cost_usd:Math.round(estCostUsd*10000)/10000});
 }
 if(norm==="/api/usage/export"&&method==="GET"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const fmt=(url.searchParams.get("format")||"json").toLowerCase();
  const days=Math.min(90,Math.max(1,parseInt(url.searchParams.get("days")||"90",10)||90));
  const since=new Date(Date.now()-days*86400000).toISOString();
  const rows=await sbGet(`/request_log?user_id=eq.${encodeURIComponent(a.sub)}&select=ts,route,model,status,error_code,prompt_tokens,completion_tokens,latency_ms&ts=gte.${encodeURIComponent(since)}&order=ts.desc&limit=10000`);
  if(fmt==="csv"){
   const header="ts,route,model,status,error_code,prompt_tokens,completion_tokens,latency_ms";
   const esc=(v:any)=>{const s=v==null?"":String(v);if(/[",\n\r]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';return s};
   const lines=rows.map((r:any)=>[r.ts,r.route,r.model,r.status,r.error_code,r.prompt_tokens,r.completion_tokens,r.latency_ms].map(esc).join(","));
   const csv=header+"\n"+lines.join("\n");
   const h=withCors(new Headers({"content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="codism-usage.csv"'}));
   return new Response(csv,{status:200,headers:h});
  }else{
   const h=withCors(new Headers({"content-type":"application/json; charset=utf-8","content-disposition":'attachment; filename="codism-usage.json"'}));
   return new Response(JSON.stringify(rows),{status:200,headers:h});
  }
 }
if(norm==="/api/playground/config"&&method==="GET"){const a=await authOr401();if(!a)return panelErr(401,"Unauthorized");const grok=await getGrokUpstream();const grok_configured=!!grok;const reason=pgGateReason(a.db);const allowed=reason===null;const plan=planOf(a.db.plan)||null;let chat_models:string[]=[...STATIC_GROK_CHAT];if(grok_configured){const now=Date.now();if(__grokModelsCache&&now-__grokModelsCache.ts<300000)chat_models=[...STATIC_GROK_CHAT,...__grokModelsCache.data.filter((id:string)=>!STATIC_GROK_CHAT.includes(id))];else{try{const ac=new AbortController();const to=setTimeout(()=>ac.abort(),4000);const r=await fetch(grok.base+"/models",{headers:{"Authorization":`Bearer ${grok.key}`,"User-Agent":BROWSER_UA},signal:ac.signal});clearTimeout(to);if(r.ok){const j=await r.json().catch(()=>null)as any;const arr=j&&typeof j==="object"?(j.data||j.models||j):null;if(Array.isArray(arr)){const ids=arr.map((m:any)=>String(m&&m.id||m&&m.name||"")).filter((id:string)=>/^grok/.test(id)&&!id.includes("imagine"));__grokModelsCache={ts:now,data:ids};const seen=new Set(STATIC_GROK_CHAT);const extra=ids.filter((id:string)=>!seen.has(id));chat_models=[...STATIC_GROK_CHAT,...extra]}}}catch{}}}logRequest(a.db.id,null,"/api/playground/config",method,null,200,null,0,0,0);return jsonRes(200,{allowed,reason,plan,grok_configured,chat_models,image:{models:["grok-imagine-image"],aspect_ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2","9:19.5","19.5:9","9:20","20:9","1:2","2:1","21:9","5:2","auto"],resolutions:["1k","1.5k","2k"],max_n:4},video:{models:["grok-imagine-video"],duration:{min:1,max:15,default:8},aspect_ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3"],resolutions:["480p","720p","1080p"]}})}
 if(norm==="/api/playground/chat"&&method==="POST"){
 const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
 const db=a.db;const _r=pgGateReason(db);if(_r) return jsonRes(403,{error:_r,code:_r});
 const grok=await getGrokUpstream();if(!grok||!grok.key) return jsonRes(503,{error:"grok_not_configured",code:"grok_not_configured"});
 let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
 const model=String(b.model||"").trim();if(!/^grok/i.test(model)) return jsonRes(400,{error:"model_not_allowed",code:"model_not_allowed"});
 const _plan=planOf(db.plan);const _lim=_plan?PLAN_RPM[_plan]:120;if(isKeyRpmLimited("pg:"+a.sub,_lim)) return jsonRes(429,{error:"rpm_exceeded",code:"rpm_exceeded"});
 if((db.monthly_quota_tokens||0)>0){const [f,t]=monthBounds();const r=await sbRpc("usage_sum",{p_user:db.id,p_from:f,p_to:t});if(!r||!r.length){logRequest(db.id,null,"/api/playground/chat",method,model,503,"quota_unavailable",0,0,0);return jsonRes(503,{error:"quota_unavailable",code:"quota_unavailable"})}const s=r[0]||{prompt_tokens:0,completion_tokens:0,quota_tokens:0};const _qt=s.quota_tokens==null?null:Number(s.quota_tokens)||0;const tot=_qt!=null?_qt:((Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0));if(tot>=(db.monthly_quota_tokens||0)){logRequest(db.id,null,"/api/playground/chat",method,model,429,"monthly_quota_exceeded",0,0,0);return jsonRes(429,{error:"monthly_quota_exceeded",code:"monthly_quota_exceeded"})}}
 if((db.daily_quota_tokens||0)>0){const [f,t]=todayBounds();const r=await sbRpc("usage_sum",{p_user:db.id,p_from:f,p_to:t});if(!r||!r.length){logRequest(db.id,null,"/api/playground/chat",method,model,503,"quota_unavailable",0,0,0);return jsonRes(503,{error:"quota_unavailable",code:"quota_unavailable"})}const s=r[0]||{prompt_tokens:0,completion_tokens:0,quota_tokens:0};const _qt=s.quota_tokens==null?null:Number(s.quota_tokens)||0;const tot=_qt!=null?_qt:((Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0));if(tot>=(db.daily_quota_tokens||0)){logRequest(db.id,null,"/api/playground/chat",method,model,429,"daily_quota_exceeded",0,0,0);return jsonRes(429,{error:"daily_quota_exceeded",code:"daily_quota_exceeded"})}}
 const msgs=b.messages;if(!Array.isArray(msgs)||!msgs.length) return jsonRes(400,{error:"invalid_messages",code:"invalid_messages"});
 let _msgs:any[]=[];for(const m of msgs){if(!m||typeof m.role!=="string"||typeof m.content!=="string") return jsonRes(400,{error:"invalid_messages",code:"invalid_messages"});const ro=String(m.role).trim().toLowerCase();if(ro!=="user"&&ro!=="assistant"&&ro!=="system") return jsonRes(400,{error:"invalid_role",code:"invalid_role"});_msgs.push({role:ro,content:String(m.content)})}
 if(typeof b.system==="string"&&b.system.trim()) _msgs.unshift({role:"system",content:String(b.system).trim()});
 if(JSON.stringify(_msgs).length>100000) return jsonRes(400,{error:"messages_too_long",code:"messages_too_long"});
 if(b.temperature!==undefined){const _t=Number(b.temperature);if(!Number.isFinite(_t)||_t<0||_t>2) return jsonRes(400,{error:"invalid_temperature",code:"invalid_temperature"})}
 if(b.max_tokens!==undefined){const _mt=Number(b.max_tokens);if(!Number.isFinite(_mt)||_mt<1||_mt>8000) return jsonRes(400,{error:"invalid_max_tokens",code:"invalid_max_tokens"})}
 const start=Date.now();const upBody:any={model,messages:_msgs,stream:true,stream_options:{include_usage:true}};if(b.temperature!==undefined) upBody.temperature=Number(b.temperature);if(b.max_tokens!==undefined) upBody.max_tokens=Number(b.max_tokens);
 const ac=new AbortController();const to=setTimeout(()=>ac.abort(),300000);if(req.signal) req.signal.addEventListener("abort",()=>ac.abort(),{once:true});let upResp:Response|null=null;let wasAbort=false;try{upResp=await fetch(grok.base+"/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+grok.key,"Content-Type":"application/json","Accept":"text/event-stream","User-Agent":BROWSER_UA},body:JSON.stringify(upBody),signal:ac.signal})}catch(e:any){if(e&&e.name==="AbortError")wasAbort=true;upResp=null}finally{clearTimeout(to)}
 if(!upResp){logRequest(db.id,null,"/api/playground/chat",method,model,wasAbort?504:502,wasAbort?"upstream_timeout":"upstream_error",0,0,Date.now()-start);return jsonRes(wasAbort?504:502,{error:wasAbort?"upstream_timeout":"upstream_error",code:wasAbort?"upstream_timeout":"upstream_error"})}
 const upCt=upResp.headers.get("content-type")||"";if(upResp.status===403&&upCt.includes("text/html")){logRequest(db.id,null,"/api/playground/chat",method,model,502,"upstream_challenge",0,0,Date.now()-start);return jsonRes(502,{error:"upstream_challenge",code:"upstream_challenge"})}
 if(!upResp.ok){const txt=await upResp.text().catch(()=>"");let j:any=null;try{j=JSON.parse(txt)}catch{};const lat=Date.now()-start;logRequest(db.id,null,"/api/playground/chat",method,model,upResp.status,"upstream_error",0,0,lat);return jsonRes(upResp.status===429?429:502,{error:"upstream_error",code:"upstream_error"})}
 const ct=upResp.headers.get("content-type")||"";if(ct.includes("text/event-stream")){
 const h=withCors(new Headers({"content-type":"text/event-stream","cache-control":"no-store","x-accel-buffering":"no"}));for(const [k,v] of upResp.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) h.set(k,v);
 let pt=0,ctk=0,found=false,compChars=0;const pChars=JSON.stringify(_msgs).length;
 const stream=new ReadableStream({async start(ctrl){const rd=upResp!.body?.getReader();if(!rd){ctrl.close();return}const d=new TextDecoder();try{while(true){const {done,value}=await rd.read();if(done)break;try{const txt=d.decode(value,{stream:true});const lines=txt.split("\n");for(const line of lines){const tr=line.trim();if(!tr.startsWith("data:"))continue;const da=tr.slice(5).trim();if(!da||da==="[DONE]")continue;try{const oj=JSON.parse(da);if(oj.usage){pt=Number(oj.usage.prompt_tokens)||0;ctk=Number(oj.usage.completion_tokens)||0;found=true}if(oj.choices&&oj.choices[0]&&oj.choices[0].delta&&oj.choices[0].delta.content) compChars+=String(oj.choices[0].delta.content).length}catch{}}}catch{}ctrl.enqueue(value)}}catch{}finally{ctrl.close();const lat=Date.now()-start;if(!found){pt=Math.ceil(pChars/4);ctk=Math.ceil(compChars/4)}const qt=quotaTokens(model,pt,ctk);sbPost("/usage_log",{user_id:db.id,model,prompt_tokens:pt,completion_tokens:ctk,quota_tokens:qt,latency_ms:lat,status:upResp!.status,saved_tokens:0,is_event:false,upstream_key_id:grok.id}).catch(()=>{});logRequest(db.id,null,"/api/playground/chat",method,model,upResp!.status,null,pt,ctk,lat)}},cancel(){try{ac.abort()}catch{}}});return new Response(stream,{status:upResp.status,headers:h})}
 const buf=new Uint8Array(await upResp.arrayBuffer());let pt2=0,ct2=0;try{const j=JSON.parse(dec.decode(buf));if(j.usage){pt2=Number(j.usage.prompt_tokens)||0;ct2=Number(j.usage.completion_tokens)||0}}catch{}const lat2=Date.now()-start;const qt2=quotaTokens(model,pt2,ct2);sbPost("/usage_log",{user_id:db.id,model,prompt_tokens:pt2,completion_tokens:ct2,quota_tokens:qt2,latency_ms:lat2,status:upResp.status,saved_tokens:0,is_event:false,upstream_key_id:grok.id}).catch(()=>{});logRequest(db.id,null,"/api/playground/chat",method,model,upResp.status,null,pt2,ct2,lat2);const hh=withCors(new Headers({"content-type":upResp.headers.get("content-type")||"application/json"}));for(const [k,v] of upResp.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) hh.set(k,v);return new Response(buf,{status:upResp.status,headers:hh})
 }
if(norm==="/api/playground/image"&&method==="POST"){const t0=Date.now();const a=await authOr401();if(!a)return panelErr(401,"Unauthorized");const reason=pgGateReason(a.db);if(reason==="no_active_plan")return panelErr(403,"no_active_plan");if(reason==="subscription_expired")return panelErr(403,"subscription_expired");const grok=await getGrokUpstream();if(!grok)return jsonRes(503,{error:"grok_not_configured"});const lim=(PLAN_RPM as any)[planOf(a.db.plan)||""]||120;if(isKeyRpmLimited("pgi:"+a.sub,lim)){logRequest(a.sub,null,"/api/playground/image",method,"grok-imagine-image",429,"rpm_exceeded",0,0,Date.now()-t0);return panelErr(429,"rpm_exceeded")}let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}const prompt=typeof b.prompt==="string"?b.prompt.trim():"";if(!prompt||prompt.length>4000)return panelErr(400,"invalid_prompt");let n=b.n===undefined?1:Number(b.n);if(!Number.isInteger(n)||n<1||n>4)return panelErr(400,"invalid_n");const ar=b.aspect_ratio!==undefined&&b.aspect_ratio!==null?String(b.aspect_ratio).trim():null;const ars=["1:1","3:4","4:3","9:16","16:9","2:3","3:2","auto"];if(ar!==null&&!ars.includes(ar))return panelErr(400,"invalid_aspect_ratio");const res=b.resolution!==undefined&&b.resolution!==null?String(b.resolution).trim():null;const ress=["1k","1.5k","2k"];if(res!==null&&!ress.includes(res))return panelErr(400,"invalid_resolution");const body:any={model:"grok-imagine-image",prompt,n,response_format:"b64_json"};if(ar)body.aspect_ratio=ar;if(res)body.resolution=res;const ac=new AbortController();const to=setTimeout(()=>ac.abort(),120000);if(req.signal)req.signal.addEventListener("abort",()=>ac.abort(),{once:true});let upResp:Response|null=null;try{upResp=await fetch(grok.base+"/images/generations",{method:"POST",headers:{authorization:"Bearer "+grok.key,"content-type":"application/json","user-agent":BROWSER_UA},body:JSON.stringify(body),signal:ac.signal})}catch{}finally{clearTimeout(to)}if(!upResp||!upResp.ok){const st=upResp?upResp.status:502;const code=st===429?429:502;logRequest(a.sub,null,"/api/playground/image",method,"grok-imagine-image",code,"media_upstream_error",0,0,Date.now()-t0);return panelErr(code,"media_upstream_error")}let j:any=null;try{j=await upResp.json()}catch{logRequest(a.sub,null,"/api/playground/image",method,"grok-imagine-image",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}const data=Array.isArray(j.data)?j.data:[];if(!data.length||!data[0]||!data[0].b64_json){logRequest(a.sub,null,"/api/playground/image",method,"grok-imagine-image",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}const usage=j.usage||{};let cost=Number.isFinite(usage.cost_in_usd_ticks)?Number(usage.cost_in_usd_ticks)/1e10:0.07*n;if(!Number.isFinite(cost))cost=0.07*n;const pt=Number(usage.input_tokens)||0;const ct=Number(usage.output_tokens)||0;const qt=mediaQuotaTokens(cost);const latency=Date.now()-t0;sbPost("/usage_log",{user_id:a.sub,model:"grok-imagine-image",prompt_tokens:pt,completion_tokens:ct,latency_ms:latency,status:200,is_event:false,upstream_key_id:grok.id,quota_tokens:qt}).catch(()=>{});logRequest(a.sub,null,"/api/playground/image",method,"grok-imagine-image",200,null,pt,ct,latency);return jsonRes(200,{ok:true,data:data.map((d:any)=>({b64_json:d.b64_json})),cost_usd:Math.round(cost*10000)/10000})}
if(norm==="/api/playground/video"&&method==="POST"){const t0=Date.now();const a=await authOr401();if(!a)return panelErr(401,"Unauthorized");const reason=pgGateReason(a.db);if(reason==="no_active_plan")return panelErr(403,"no_active_plan");if(reason==="subscription_expired")return panelErr(403,"subscription_expired");const grok=await getGrokUpstream();if(!grok)return jsonRes(503,{error:"grok_not_configured"});const lim=(PLAN_RPM as any)[planOf(a.db.plan)||""]||120;if(isKeyRpmLimited("pgv:"+a.sub,lim)){logRequest(a.sub,null,"/api/playground/video",method,"grok-imagine-video",429,"rpm_exceeded",0,0,Date.now()-t0);return panelErr(429,"rpm_exceeded")}let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}const prompt=typeof b.prompt==="string"?b.prompt.trim():"";if(!prompt||prompt.length>4000)return panelErr(400,"invalid_prompt");let duration=b.duration!==undefined&&b.duration!==null?Number(b.duration):undefined;if(duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>15))return panelErr(400,"invalid_duration");const ar=b.aspect_ratio!==undefined&&b.aspect_ratio!==null?String(b.aspect_ratio).trim():null;const ars=["1:1","16:9","9:16","4:3","3:4","3:2","2:3"];if(ar!==null&&!ars.includes(ar))return panelErr(400,"invalid_aspect_ratio");const res=b.resolution!==undefined&&b.resolution!==null?String(b.resolution).trim():null;const ress=["480p","720p","1080p"];if(res!==null&&!ress.includes(res))return panelErr(400,"invalid_resolution");const body:any={model:"grok-imagine-video",prompt};if(duration!==undefined)body.duration=duration;if(ar)body.aspect_ratio=ar;if(res)body.resolution=res;const ac=new AbortController();const to=setTimeout(()=>ac.abort(),60000);if(req.signal)req.signal.addEventListener("abort",()=>ac.abort(),{once:true});let upResp:Response|null=null;try{upResp=await fetch(grok.base+"/videos/generations",{method:"POST",headers:{authorization:"Bearer "+grok.key,"content-type":"application/json","user-agent":BROWSER_UA},body:JSON.stringify(body),signal:ac.signal})}catch{}finally{clearTimeout(to)}if(!upResp||!upResp.ok){logRequest(a.sub,null,"/api/playground/video",method,"grok-imagine-video",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}let j:any=null;try{j=await upResp.json()}catch{logRequest(a.sub,null,"/api/playground/video",method,"grok-imagine-video",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}const rid=typeof j.request_id==="string"?j.request_id.trim():"";if(!rid){logRequest(a.sub,null,"/api/playground/video",method,"grok-imagine-video",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}logRequest(a.sub,null,"/api/playground/video",method,"grok-imagine-video",upResp.status,null,0,0,Date.now()-t0);return jsonRes(200,{ok:true,request_id:rid,status:"pending"})}
if(norm==="/api/playground/video/status"&&method==="POST"){const t0=Date.now();const a=await authOr401();if(!a)return panelErr(401,"Unauthorized");const reason=pgGateReason(a.db);if(reason==="no_active_plan")return panelErr(403,"no_active_plan");if(reason==="subscription_expired")return panelErr(403,"subscription_expired");const grok=await getGrokUpstream();if(!grok)return jsonRes(503,{error:"grok_not_configured"});const lim=(PLAN_RPM as any)[planOf(a.db.plan)||""]||120;if(isKeyRpmLimited("pgv:"+a.sub,lim)){logRequest(a.sub,null,"/api/playground/video/status",method,"grok-imagine-video",429,"rpm_exceeded",0,0,Date.now()-t0);return panelErr(429,"rpm_exceeded")}let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}const rid=typeof b.request_id==="string"?b.request_id.trim():"";if(!/^[A-Za-z0-9_-]{8,80}$/.test(rid))return panelErr(400,"invalid_request_id");const ac=new AbortController();const to=setTimeout(()=>ac.abort(),10000);if(req.signal)req.signal.addEventListener("abort",()=>ac.abort(),{once:true});let upResp:Response|null=null;try{upResp=await fetch(grok.base+"/videos/"+encodeURIComponent(rid),{method:"GET",headers:{authorization:"Bearer "+grok.key,"user-agent":BROWSER_UA},signal:ac.signal})}catch{}finally{clearTimeout(to)}if(!upResp||!upResp.ok){const st=upResp?upResp.status:502;if(st===404){logRequest(a.sub,null,"/api/playground/video/status",method,"grok-imagine-video",404,"request_not_found",0,0,Date.now()-t0);return panelErr(404,"request_not_found")}logRequest(a.sub,null,"/api/playground/video/status",method,"grok-imagine-video",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}let j:any=null;try{j=await upResp.json()}catch{logRequest(a.sub,null,"/api/playground/video/status",method,"grok-imagine-video",502,"media_upstream_error",0,0,Date.now()-t0);return panelErr(502,"media_upstream_error")}const status=String(j.status||"pending");const progress=Number(j.progress)||0;const video=j.video||null;const err=j.error||null;const usage=j.usage||{};const ticks=usage.cost_in_usd_ticks;let cost=null;if(Number.isFinite(ticks))cost=Math.round(Number(ticks)/1e10*10000)/10000;if(status==="done"){let c=Number(ticks)/1e10;if(!Number.isFinite(c))c=0;const qt=mediaQuotaTokens(c);const g=(globalThis as any);if(!g.__pgVideoLogged)g.__pgVideoLogged=new Set();if(g.__pgVideoLogged.size>500)g.__pgVideoLogged.clear();if(!g.__pgVideoLogged.has(rid)){g.__pgVideoLogged.add(rid);sbPost("/usage_log",{user_id:a.sub,model:"grok-imagine-video",prompt_tokens:0,completion_tokens:0,latency_ms:0,status:200,is_event:false,upstream_key_id:grok.id,quota_tokens:qt}).catch(()=>{})}logRequest(a.sub,null,"/api/playground/video/done","POST","grok-imagine-video",200,null,0,0,0)}else if(status==="failed"){logRequest(a.sub,null,"/api/playground/video/failed","POST","grok-imagine-video",502,"media_failed",0,0,Date.now()-t0)}return jsonRes(200,{ok:true,status,progress,video_url:(video&&video.url)||null,error:(err&&err.message)||null,cost_usd:cost})}
 // admin routes
 if(pathname.startsWith("/api/admin/")){


  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  if(a.role!=="admin") return panelErr(403,"Admin only");
  if(norm==="/api/admin/event"&&method==="GET"){const ev=await getEventState();if(!ev) return jsonRes(200,{ok:true,event:null,status:"disabled",pool_spent_ours:0,pool_spent_other:0,mirror:null});
const st=eventStatusOf(ev,Date.now());const rem=Math.max(0,(Number(ev.pool_total)||0)-(Number(ev.spent)||0));return jsonRes(200,{ok:true,event:{model:ev.model,upstream_model:ev.upstream_model,pool_total:ev.pool_total,pool_spent:ev.spent,pool_spent_ours:ev.spent_ours||0,pool_spent_other:ev.spent_other||0,pool_remaining:rem,opens_at:ev.opens_at,enabled:ev.enabled,status:st,mirror_sync:ev.apmix_sync!==false,mirror:ev.apmix||null},status:st,model:ev.model,upstream_model:ev.upstream_model,pool_total:ev.pool_total,pool_spent:ev.spent,pool_spent_ours:ev.spent_ours||0,pool_spent_other:ev.spent_other||0,pool_remaining:rem,opens_at:ev.opens_at,enabled:ev.enabled,mirror_sync:ev.apmix_sync!==false,mirror:ev.apmix||null});

}
  if(norm==="/api/admin/event"&&method==="PATCH"){let b:any=null;try{b=await req.json()}catch{return panelErr(400,"invalid json")}const patch:any={};if(b.model!==undefined){const v=String(b.model).trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(v)) return panelErr(400,"invalid model");patch.model=v}if(b.upstream_model!==undefined){const v=String(b.upstream_model).trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(v)) return panelErr(400,"invalid upstream_model");patch.upstream_model=v}if(b.pool_total!==undefined){const n=Number(b.pool_total);if(!Number.isFinite(n)||n<1||n>1e15) return panelErr(400,"invalid pool_total");patch.pool_total=Math.round(n)}if(b.opens_at!==undefined){const t=Date.parse(String(b.opens_at));if(isNaN(t)) return panelErr(400,"invalid opens_at");patch.opens_at=new Date(t).toISOString()}if(b.enabled!==undefined){if(typeof b.enabled!=="boolean") return panelErr(400,"invalid enabled");patch.enabled=b.enabled}if(b.mirror_sync!==undefined||b.apmix_sync!==undefined){const _ms=(b.mirror_sync!==undefined?b.mirror_sync:b.apmix_sync);if(typeof _ms!=="boolean") return panelErr(400,"invalid mirror_sync");patch.apmix_sync=_ms}
if(Object.keys(patch).length===0) return panelErr(400,"no fields");patch.updated_at=new Date().toISOString();try{await sbPatch("/event_state?id=eq.1",patch)}catch(e:any){return panelErr(500,"event update failed")}invalidateEventCache();return jsonRes(200,{ok:true});}
  if(norm==="/api/admin/users"&&method==="GET"){
   const users=await sbGet(`/users?select=id,email,name,role,enabled,plan,daily_quota_tokens,monthly_quota_tokens,created_at,username,subscription_expires_at,upstream_key_id&order=created_at.desc`);
   const keys=await sbGet(`/api_keys?select=user_id`);
   const cnt=new Map<string,number>();for(const k of keys) cnt.set(k.user_id,(cnt.get(k.user_id)||0)+1);
   const uk=await sbGet(`/upstream_keys?select=id,label`);const ukMap=new Map<string,string>();for(const x of uk) ukMap.set(x.id,x.label);
   const usageRows=await sbRpc("admin_user_usage",{});const uMap=new Map<string,any>();for(const r of usageRows) uMap.set(r.user_id,r);
   const out=users.map((u:any)=>{const us=uMap.get(u.id)||{};return {id:u.id,email:u.email,name:u.name,role:u.role,enabled:u.enabled,plan:planOf(u.plan)||(String(u.plan||"")==="none"?"none":null),

daily_quota_tokens:u.daily_quota_tokens,monthly_quota_tokens:u.monthly_quota_tokens,created_at:u.created_at,key_count:cnt.get(u.id)||0,username:u.username||null,subscription_expires_at:u.subscription_expires_at||null,upstream_key_id:u.upstream_key_id||null,upstream_key_label:u.upstream_key_id?ukMap.get(u.upstream_key_id)||null:null,usage_month_tokens:Number(us.month_tokens||0),usage_month_requests:Number(us.month_requests||0),usage_total_tokens:Number(us.total_tokens||0)}});
   return jsonRes(200,out);
  }

  if(norm==="/api/admin/users"&&method==="POST"){
   let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
   const rawEmail=b.email!=null?String(b.email).trim():"";const rawUsername=b.username!=null?String(b.username).trim().toLowerCase():"";const name=(b.name||"").trim(),password=b.password||"",role=b.role==="admin"?"admin":"user";
   if(!name||!password||(!rawEmail&&!rawUsername)) return panelErr(400,"missing fields");
   let email:any=null;if(rawEmail){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) return panelErr(400,"invalid email");const ex=await sbGet(`/users?email=eq.${encodeURIComponent(rawEmail)}&select=id`);if(ex.length) return panelErr(409,"email exists");email=rawEmail}
   let username:any=null;if(rawUsername){if(!/^[a-z0-9_-]{3,32}$/.test(rawUsername)) return panelErr(400,"invalid username");const ex2=await sbGet(`/users?username=eq.${encodeURIComponent(rawUsername)}&select=id`);if(ex2.length) return panelErr(409,"username exists");username=rawUsername}
   let subscription_expires_at:any=null;if(b.subscription_expires_at!==undefined&&b.subscription_expires_at!==null){const v=String(b.subscription_expires_at).trim();if(!v) subscription_expires_at=null;else if(isNaN(Date.parse(v))) return panelErr(400,"invalid subscription date");else subscription_expires_at=new Date(v).toISOString()}
   let upstream_key_id:any=null;if(b.upstream_key_id!==undefined&&b.upstream_key_id!==null&&String(b.upstream_key_id).trim()!==""){const ukId=String(b.upstream_key_id).trim();const uk=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(ukId)}&select=id`);if(!uk.length) return panelErr(400,"invalid upstream key");upstream_key_id=ukId}
   const h=await hashPassword(password);
   const _wantsNone=String(b.plan||"").trim().toLowerCase()==="none";
   const plan:any=_wantsNone?"none":planOf(b.plan||"starter");
   if(!_wantsNone&&!plan) return panelErr(400,"invalid plan");
   const mq=_wantsNone?0:(planQuota(plan)||0);
   const dq:any=0;
   try{const ins=await sbPost("/users",{email,name,password_hash:h,role,enabled:true,plan,daily_quota_tokens:dq,monthly_quota_tokens:mq||0,username,subscription_expires_at,upstream_key_id});return jsonRes(200,ins[0]||{ok:true})}catch(e:any){console.error("admin create user failed:",String(e.message||e));const m2=String(e.message||"");if(m2.includes("duplicate")||m2.includes("23505")){if(m2.includes("users_username_unique")) return panelErr(409,"username exists");return panelErr(409,"email exists")}return panelErr(400,"create failed")}
  }

  if(pathname.startsWith("/api/admin/users/")&&method==="PATCH"){
   const id=pathname.split("/")[4];
   let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
   if(id===a.sub){
    if(b.enabled===false) return panelErr(403,"cannot disable self");
    if(b.role&&b.role!=="admin") return panelErr(403,"cannot demote self");
   }
   const patch:any={};
   if(typeof b.enabled==="boolean") patch.enabled=b.enabled;
   if(b.daily_quota_tokens!==undefined) patch.daily_quota_tokens=parseInt(b.daily_quota_tokens,10)||0;
   if(b.monthly_quota_tokens!==undefined) patch.monthly_quota_tokens=parseInt(b.monthly_quota_tokens,10)||0;
   if(b.role) patch.role=b.role;
   if(b.password) patch.password_hash=await hashPassword(b.password);
   if(b.plan!==undefined){if(String(b.plan).trim().toLowerCase()==="none"){patch.plan="none";if(b.monthly_quota_tokens===undefined)patch.monthly_quota_tokens=0;if(b.daily_quota_tokens===undefined)patch.daily_quota_tokens=0}else{const pl=planOf(b.plan);if(!pl) return panelErr(400,"invalid plan");patch.plan=pl;if(b.monthly_quota_tokens===undefined)patch.monthly_quota_tokens=planQuota(pl)||0;if(b.daily_quota_tokens===undefined)patch.daily_quota_tokens=0}}
   if(b.username!==undefined){if(b.username===null||String(b.username).trim()==="") patch.username=null;else{const u=String(b.username).trim().toLowerCase();if(!/^[a-z0-9_-]{3,32}$/.test(u)) return panelErr(400,"invalid username");const ex=await sbGet(`/users?username=eq.${encodeURIComponent(u)}&id=neq.${encodeURIComponent(id)}&select=id`);if(ex.length) return panelErr(409,"username exists");patch.username=u}}
   if(b.email!==undefined){if(b.email===null||String(b.email).trim()==="") patch.email=null;else{const e=String(b.email).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return panelErr(400,"invalid email");const ex=await sbGet(`/users?email=eq.${encodeURIComponent(e)}&id=neq.${encodeURIComponent(id)}&select=id`);if(ex.length) return panelErr(409,"email exists");patch.email=e}}
   if(b.subscription_expires_at!==undefined){if(b.subscription_expires_at===null||String(b.subscription_expires_at).trim()==="") patch.subscription_expires_at=null;else{const v=String(b.subscription_expires_at).trim();if(isNaN(Date.parse(v))) return panelErr(400,"invalid subscription date");patch.subscription_expires_at=new Date(v).toISOString()}}
   if(b.upstream_key_id!==undefined){if(b.upstream_key_id===null||String(b.upstream_key_id).trim()==="") patch.upstream_key_id=null;else{const ukId=String(b.upstream_key_id).trim();const uk=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(ukId)}&select=id`);if(!uk.length) return panelErr(400,"invalid upstream key");patch.upstream_key_id=ukId}}
   await sbPatch(`/users?id=eq.${encodeURIComponent(id)}`,patch);
   return jsonRes(200,{ok:true});
  }
  if(pathname.startsWith("/api/admin/users/")&&method==="DELETE"){
   const id=pathname.split("/")[4];
   if(id===a.sub) return panelErr(403,"cannot delete self");
   await sbDelete(`/users?id=eq.${encodeURIComponent(id)}`);
   return jsonRes(200,{ok:true});
  }
  if(norm==="/api/admin/upstream-keys"&&method==="GET"){const keys=await sbGet(`/upstream_keys?select=id,label,key,enabled,base_url,is_default,created_at&order=created_at.desc`);const users=await sbGet(`/users?select=upstream_key_id`);const counts:Record<string,number>={};for(const u of (users as any[])){if(u.upstream_key_id) counts[u.upstream_key_id]=(counts[u.upstream_key_id]||0)+1}return jsonRes(200,keys.map((k:any)=>({id:k.id,label:k.label,key_masked:k.key.length<=10?k.key.slice(0,2)+"••••":k.key.slice(0,6)+"••••"+k.key.slice(-4),enabled:k.enabled,base_url:k.base_url||null,is_default:!!k.is_default,created_at:k.created_at,assigned_users:counts[k.id]||0})))}
  if(norm==="/api/admin/upstream-keys"&&method==="POST"){const b=await readJson(req);const label=(b.label||"").trim();const key=(b.key||"").trim();if(!label||label.length>80||!key||key.length<8||key.length>200) return panelErr(400,"invalid upstream key fields");let base_url:any=null;if(b.base_url!==undefined&&b.base_url!==null&&String(b.base_url).trim()!==""){const bu=String(b.base_url).trim();if(!/^https:\/\/[^\s]+$/.test(bu)||bu.length>300) return panelErr(400,"invalid base_url");base_url=bu.replace(/\/+$/,"")}const isDefault=b.is_default===true;try{const rows=await sbPost(`/upstream_keys`,{label,key,base_url,is_default:isDefault});const k=rows[0];if(isDefault&&k&&k.id) await sbPatch(`/upstream_keys?id=neq.${encodeURIComponent(String(k.id))}&is_default=eq.true`,{is_default:false}).catch(()=>{});return jsonRes(200,{id:k.id,label:k.label,key_masked:k.key.length<=10?k.key.slice(0,2)+"••••":k.key.slice(0,6)+"••••"+k.key.slice(-4),enabled:k.enabled,base_url:k.base_url||null,is_default:!!k.is_default,created_at:k.created_at,assigned_users:0})}catch(e){if(String(e).includes("23505")) return panelErr(409,"upstream key exists");throw e}}
  if(pathname.startsWith("/api/admin/upstream-keys/")&&method==="PATCH"){const id=pathname.split("/")[4];const b=await readJson(req);const patch:Record<string,any>={};if(b.label!==undefined){const label=String(b.label).trim();if(!label||label.length>80) return panelErr(400,"invalid upstream key fields");patch.label=label}if(b.enabled!==undefined) patch.enabled=!!b.enabled;if(b.is_default!==undefined) patch.is_default=!!b.is_default;if(b.base_url!==undefined){if(b.base_url===null||String(b.base_url).trim()==="") patch.base_url=null;else{const bu=String(b.base_url).trim();if(!/^https:\/\/[^\s]+$/.test(bu)||bu.length>300) return panelErr(400,"invalid base_url");patch.base_url=bu.replace(/\/+$/,"")}}if(Object.keys(patch).length===0) return panelErr(400,"no fields");if(patch.is_default===true) await sbPatch(`/upstream_keys?id=neq.${encodeURIComponent(id)}&is_default=eq.true`,{is_default:false}).catch(()=>{});await sbPatch(`/upstream_keys?id=eq.${encodeURIComponent(id)}`,patch);return jsonRes(200,{ok:true})}
  if(pathname.startsWith("/api/admin/upstream-keys/")&&method==="DELETE"){const id=pathname.split("/")[4];await sbDelete(`/upstream_keys?id=eq.${encodeURIComponent(id)}`);return jsonRes(200,{ok:true})}
  async function validateSteps(v:any):Promise<Array<{upstream_key_id:string|null,model:string}>|null>{
   if(!Array.isArray(v)||v.length<1||v.length>8) return null;
   const out:Array<{upstream_key_id:string|null,model:string}>=[];
   for(const s of v){
    if(!s||typeof s!=="object") return null;
    const model=String(s.model||"").trim();
    if(!model||model.length>160) return null;
    let ukid:string|null=null;
    if(s.upstream_key_id!==undefined&&s.upstream_key_id!==null&&String(s.upstream_key_id).trim()!==""){
     const u=String(s.upstream_key_id).trim();
     const ks=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(u)}&select=id`);
     if(!ks.length) return null;
     ukid=u;
    }
    out.push({upstream_key_id:ukid,model});
   }
   return out;
  }
  if(pathname.startsWith("/api/admin/upstream-keys/")&&pathname.endsWith("/test")&&method==="POST"){const id=pathname.split("/")[4];const ks=await sbGet(`/upstream_keys?id=eq.${encodeURIComponent(id)}&select=key,base_url,enabled,label`);if(!ks[0]) return panelErr(404,"not found");const b0=(ks[0].base_url||"").trim().replace(/\/+$/,"")||upstreamBase();const t0=Date.now();let ok=false;let status=0;const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),5000);try{const r=await fetch(`${b0}/models`,{headers:{...(ks[0].key?{"Authorization":`Bearer ${ks[0].key}`}:{}),"User-Agent":BROWSER_UA},signal:ctrl.signal});ok=r.ok;status=r.status}catch{ok=false}finally{clearTimeout(to)}return jsonRes(200,{ok,status,latency_ms:Date.now()-t0,base:b0})}
  if(norm==="/api/admin/combos"&&method==="GET"){const rows=await sbGet(`/combos?select=id,name,steps,is_default,enabled,created_at&order=created_at.desc`);return jsonRes(200,rows)}
  if(norm==="/api/admin/combos"&&method==="POST"){
   let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
   const name=String(b.name||"").trim().toLowerCase();
   if(!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(name)) return panelErr(400,"invalid combo name (lowercase alnum, dash, underscore, max 41)");
   const steps=await validateSteps(b.steps);if(steps===null) return panelErr(400,"invalid combo steps");
   const ex=await sbGet(`/combos?name=eq.${encodeURIComponent(name)}&select=id`);if(ex.length) return panelErr(409,"combo name exists");
   if(b.is_default) await sbPatch(`/combos?is_default=eq.true`,{is_default:false});
   const ins=await sbPost("/combos",{name,steps,is_default:!!b.is_default,enabled:b.enabled===undefined?true:!!b.enabled});
   return jsonRes(200,ins[0]||{ok:true});
  }
  if(pathname.startsWith("/api/admin/combos/")&&method==="PATCH"){
   const id=pathname.split("/")[4];
   let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
   const patch:any={};
   if(b.name!==undefined){const name=String(b.name).trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(name)) return panelErr(400,"invalid combo name");const ex=await sbGet(`/combos?name=eq.${encodeURIComponent(name)}&id=neq.${encodeURIComponent(id)}&select=id`);if(ex.length) return panelErr(409,"combo name exists");patch.name=name}
   if(b.steps!==undefined){const steps=await validateSteps(b.steps);if(steps===null) return panelErr(400,"invalid combo steps");patch.steps=steps}
   if(b.enabled!==undefined) patch.enabled=!!b.enabled;
   if(b.is_default!==undefined){patch.is_default=!!b.is_default;if(patch.is_default) await sbPatch(`/combos?is_default=eq.true&id=neq.${encodeURIComponent(id)}`,{is_default:false})}
   if(Object.keys(patch).length===0) return panelErr(400,"no fields");
   await sbPatch(`/combos?id=eq.${encodeURIComponent(id)}`,patch);
   return jsonRes(200,{ok:true});
  }
  if(pathname.startsWith("/api/admin/combos/")&&method==="DELETE"){const id=pathname.split("/")[4];await sbDelete(`/combos?id=eq.${encodeURIComponent(id)}`);return jsonRes(200,{ok:true})}
  if(norm==="/api/admin/stats"&&method==="GET"){
   const [totals,by]=await Promise.all([sbRpc("admin_totals",{p_offset_min:TZ_OFF_MIN}),sbRpc("admin_usage_by_day",{p_days:14,p_offset_min:TZ_OFF_MIN})]);
   let est_cost_usd=0;
   try{const bm30=await sbRpc("admin_usage_by_model",{p_days:30,p_offset_min:TZ_OFF_MIN});for(const r of (Array.isArray(bm30)?bm30:[])) est_cost_usd+=estCost(String(r.model||""),Number(r.prompt_tokens)||0,Number(r.completion_tokens)||0)}catch{}
   let recent:any[]=[];let top_users:any[]=[];
   try{
    const rec:any[]=await sbGet("/request_log?select=ts,route,model,status,error_code,prompt_tokens,completion_tokens,user_id&order=ts.desc&limit=20");
    const [mFrom,mTo]=monthBounds();
    const ulog:any[]=await sbGet(`/usage_log?select=user_id,prompt_tokens,completion_tokens&created_at=gte.${encodeURIComponent(mFrom)}&created_at=lt.${encodeURIComponent(mTo)}&limit=10000`);
    const g=new Map<string,{requests:number,tokens:number}>();
    for(const r of (Array.isArray(ulog)?ulog:[])){const uid=r.user_id;if(!uid)continue;const cur=g.get(uid)||{requests:0,tokens:0};cur.requests+=1;cur.tokens+=(Number(r.prompt_tokens)||0)+(Number(r.completion_tokens)||0);g.set(uid,cur);}
    let topArr=[...g.entries()].map(([uid,v])=>({user_id:uid,requests:v.requests,tokens:v.tokens})).sort((a,b)=>b.tokens-a.tokens).slice(0,10);
    const idSet=new Set<string>();
    for(const r of (Array.isArray(rec)?rec:[])) if(r.user_id) idSet.add(r.user_id);
    for(const t of topArr) if(t.user_id) idSet.add(t.user_id);
    const uMap=new Map<string,any>();
    if(idSet.size){const ids=[...idSet].join(",");const users:any[]=await sbGet(`/users?id=in.(${ids})&select=id,email,username,name`);for(const u of (Array.isArray(users)?users:[])) uMap.set(u.id,u);}
    recent=(Array.isArray(rec)?rec:[]).map((r:any)=>({ts:r.ts,route:r.route,model:r.model,status:r.status,error_code:r.error_code,prompt_tokens:r.prompt_tokens,completion_tokens:r.completion_tokens,user_id:r.user_id,user_display:(()=>{const u=uMap.get(r.user_id);return u?(u.email||u.username||u.name||null):null})()}));
    top_users=topArr.map((t:any)=>({user_id:t.user_id,user_display:(()=>{const u=uMap.get(t.user_id);return u?(u.email||u.username||u.name||null):null})(),requests:t.requests,tokens:t.tokens}));
   }catch{}
   return jsonRes(200,{totals:totals[0]||{users:0,keys:0,active_keys:0,requests_today:0,tokens_today:0,failed_today:0},by_day:by,recent,top_users,est_cost_usd:Math.round(est_cost_usd*10000)/10000});
  }
  return panelErr(404,"not found");
 }
 // OpenAI compatible
 const isModels = (norm==="/v1/models"||norm==="/models");
 if(isModels&&method==="GET"){
  const t0=Date.now();
  const auth=req.headers.get("authorization")||req.headers.get("Authorization")||"";
  let keyText="";if(auth.toLowerCase().startsWith("bearer ")) keyText=auth.slice(7).trim();else keyText=(req.headers.get("x-api-key")||"").trim();
  if(!keyText){logRequest(null,null,"/v1/models",method,null,401,"missing_api_key",0,0,Date.now()-t0);return openaiErr(401,"Missing API key.","invalid_request_error","missing_api_key")}
  const kRows=await sbGet(`/api_keys?key=eq.${encodeURIComponent(keyText)}&select=id,user_id,enabled,models`);
  const kRow=kRows[0];if(!kRow){logRequest(null,null,"/v1/models",method,null,401,"invalid_api_key",0,0,Date.now()-t0);return openaiErr(401,"Invalid API key.","invalid_request_error","invalid_api_key")}
  if(!kRow.enabled){logRequest(kRow.user_id,kRow.id,"/v1/models",method,null,403,"key_disabled",0,0,Date.now()-t0);return openaiErr(403,"This API key has been disabled.","insufficient_quota","key_disabled")}
  const uRows=await sbGet(`/users?id=eq.${encodeURIComponent(kRow.user_id)}&select=id,enabled,subscription_expires_at,upstream_key_id`);
  const uRow=uRows[0];if(!uRow||!uRow.enabled){logRequest(uRow?uRow.id:null,kRow.id,"/v1/models",method,null,403,"user_disabled",0,0,Date.now()-t0);return openaiErr(403,"User disabled.","insufficient_quota","user_disabled")}if(uRow.subscription_expires_at&&Date.now()>Date.parse(uRow.subscription_expires_at)){logRequest(uRow.id,kRow.id,"/v1/models",method,null,403,"subscription_expired",0,0,Date.now()-t0);return openaiErr(403,"Your subscription has expired. Please renew it.","insufficient_quota","subscription_expired")}
  const aliases=parseAliases();
  const synthetic=Object.keys(aliases).map(id=>({id,object:"model",created:1700000000,owned_by:"codism-panel"}));
  try{
   const g3=(globalThis as any);const now3=Date.now();
   if(!g3.__codismCombosCache||now3-g3.__codismCombosCache.ts>5*60*1000){
    const crows=await sbGet(`/combos?enabled=eq.true&select=name&order=name`);
    g3.__codismCombosCache={ts:now3,names:(Array.isArray(crows)?crows:[]).map((c:any)=>String(c.name||"").toLowerCase()).filter(Boolean)};
   }
   for(const cn of (g3.__codismCombosCache.names||[])) synthetic.push({id:COMBO_PREFIX+cn,object:"model",created:1700000000,owned_by:"codism-combo"});
  }catch{}
  const modelsStr=(kRow.models||"*").trim();
  const filterList=(arr:any[])=>{
   if(modelsStr==="*"||modelsStr==="") return arr;
   const allowed=new Set(modelsStr.split(",").map((s:string)=>s.trim()).filter(Boolean));
   return arr.filter((m:any)=>allowed.has(m.id));
  };
  try{
   const ac=new AbortController();const t=setTimeout(()=>ac.abort(),300000);if(req.signal)req.signal.addEventListener("abort",()=>ac.abort(),{once:true});
   const up=await fetch(upstreamBase()+"/models",{method:"GET",headers:{"authorization":`Bearer ${getEnv("UPSTREAM_API_KEY")}`,"user-agent":BROWSER_UA,"accept":"application/json"},signal:ac.signal});
   clearTimeout(t);
   const ct=up.headers.get("content-type")||"";
   if(up.ok&&ct.includes("application/json")){
    const data=await up.json();const list=Array.isArray(data.data)?data.data:[];for(const s of synthetic)list.push(s);try{const pm=await poolModels();const _s=new Set(list.map((x:any)=>x.id));for(const m of pm){if(!_s.has(m.id)){list.push(m);_s.add(m.id)}}}catch{}let filtered=filterList(list);try{const ev=await getEventState();if(ev&&eventStatusOf(ev,Date.now())==="live"&&!filtered.some((m:any)=>m.id===ev.model)) filtered.push({id:ev.model,object:"model",created:1700000000,owned_by:"codism-event"})}catch{}const out={object:"list",data:filtered};const h=withCors(new Headers({"content-type":"application/json"}));for(const [k,v] of up.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) h.set(k,v);return new Response(JSON.stringify(out),{status:200,headers:h});
   }
  }catch{}
  let fb=filterList(synthetic.slice());try{const pm=await poolModels();for(const m of pm){if(!fb.some((x:any)=>x.id===m.id))fb.push(m)}}catch{}try{const ev=await getEventState();if(ev&&eventStatusOf(ev,Date.now())==="live"&&!fb.some((m:any)=>m.id===ev.model)) fb.push({id:ev.model,object:"model",created:1700000000,owned_by:"codism-event"})}catch{}return jsonRes(200,{object:"list",data:fb});

 }
 const isChat = (norm==="/v1/chat/completions"||norm==="/chat/completions");
 if(isChat&&method==="POST"){
  const t0=Date.now();
  const maxB=maxBodyBytes();
  const cl=req.headers.get("content-length");if(cl&&parseInt(cl,10)>maxB){logRequest(null,null,"/v1/chat/completions",method,null,413,"body_too_large",0,0,Date.now()-t0);return openaiErr(413,"Request body too large.","invalid_request_error","body_too_large")}
  let raw:Uint8Array|null=null;try{const ab=await req.arrayBuffer();raw=ab.byteLength?new Uint8Array(ab):null}catch{raw=null}
  if(raw&&raw.byteLength>maxB){logRequest(null,null,"/v1/chat/completions",method,null,413,"body_too_large",0,0,Date.now()-t0);return openaiErr(413,"Request body too large.","invalid_request_error","body_too_large")}
  const auth=req.headers.get("authorization")||req.headers.get("Authorization")||"";let keyText="";if(auth.toLowerCase().startsWith("bearer ")) keyText=auth.slice(7).trim();else keyText=(req.headers.get("x-api-key")||"").trim();
  if(!keyText){logRequest(null,null,"/v1/chat/completions",method,null,401,"missing_api_key",0,0,Date.now()-t0);return openaiErr(401,"Missing API key.","invalid_request_error","missing_api_key")}
  const kRows=await sbGet(`/api_keys?key=eq.${encodeURIComponent(keyText)}&select=id,user_id,enabled,models,token_saver,debug`);
  const kRow=kRows[0];if(!kRow){logRequest(null,null,"/v1/chat/completions",method,null,401,"invalid_api_key",0,0,Date.now()-t0);return openaiErr(401,"Invalid API key.","invalid_request_error","invalid_api_key")}
  if(!kRow.enabled){logRequest(kRow.user_id,kRow.id,"/v1/chat/completions",method,null,403,"key_disabled",0,0,Date.now()-t0);return openaiErr(403,"This API key has been disabled.","insufficient_quota","key_disabled")}
  const uRows=await sbGet(`/users?id=eq.${encodeURIComponent(kRow.user_id)}&select=id,enabled,plan,role,daily_quota_tokens,monthly_quota_tokens,subscription_expires_at,upstream_key_id`);
  const uRow=uRows[0];if(!uRow||!uRow.enabled){logRequest(uRow?uRow.id:null,kRow.id,"/v1/chat/completions",method,null,403,"user_disabled",0,0,Date.now()-t0);return openaiErr(403,"User disabled.","insufficient_quota","user_disabled")}
 {const _lim=(PLAN_RPM as any)[uRow.plan]||120;if(isKeyRpmLimited(kRow.id,_lim)){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,null,429,"rpm_exceeded",0,0,Date.now()-t0);return openaiErr(429,"Rate limit exceeded. Too many requests for this key.","rate_limit_error","rpm_exceeded")}}if(uRow.subscription_expires_at&&Date.now()>Date.parse(uRow.subscription_expires_at)){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,null,403,"subscription_expired",0,0,Date.now()-t0);return openaiErr(403,"Your subscription has expired. Please renew it.","insufficient_quota","subscription_expired")}

  let bodyJson:any=null;if(raw)try{bodyJson=JSON.parse(dec.decode(raw))}catch{}
  const aliases=parseAliases();
  let expandedModel=bodyJson?.model||"";
  if(typeof expandedModel==="string"&&aliases[expandedModel]) expandedModel=aliases[expandedModel];
  else if(typeof expandedModel==="string"&&/^(cc|codism)\//.test(expandedModel)) expandedModel=expandedModel.split("/").slice(1).join("/");
  // event model detection (shared pool; bypasses per-key model gate + token quotas)
  const evState=await getEventState();
  const evReq=!!(evState&&evState.enabled&&expandedModel&&expandedModel.toLowerCase()===String(evState.model));
  if(!evReq&&uRow.role!=="admin"&&!planOf(uRow.plan)){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,403,"no_active_plan",0,0,Date.now()-t0);return openaiErr(403,"No active plan on this account. Please purchase a plan to use the API.","insufficient_quota","no_active_plan")}
  // model gate
  const modelsStr=(kRow.models||"*").trim();
  if(!evReq&&modelsStr!=="*"&&modelsStr!==""){
   const set=new Set(modelsStr.split(",").map((s:string)=>s.trim()).filter(Boolean));
   const rawModel=(bodyJson&&typeof bodyJson.model==="string")?bodyJson.model:"";
   if(expandedModel&&!set.has(expandedModel)&&!set.has("*")&&!set.has(rawModel)){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel,404,"model_not_allowed",0,0,Date.now()-t0);return openaiErr(404,`The model '${expandedModel}' does not exist or you do not have access to it.`,"invalid_request_error","model_not_allowed")}
  }
  if(bodyJson&&typeof bodyJson.model==="string"&&expandedModel!==bodyJson.model){bodyJson.model=expandedModel;raw=enc.encode(JSON.stringify(bodyJson))}
  // quota (event requests draw from the shared pool instead)
  if(!evReq&&(uRow.daily_quota_tokens||0)>0){
   const [f,t]=todayBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});
   if(!r||!r.length){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,503,"quota_unavailable",0,0,Date.now()-t0);return openaiErr(503,"quota check unavailable, try again","api_error","quota_unavailable")}
   const s=r[0]||{prompt_tokens:0,completion_tokens:0,quota_tokens:0};const _qt=s.quota_tokens==null?null:Number(s.quota_tokens)||0;const tot=_qt!=null?_qt:((Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0));if(tot>=uRow.daily_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"daily_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"daily token quota exceeded","insufficient_quota","daily_quota_exceeded")}
  }
  if(!evReq&&(uRow.monthly_quota_tokens||0)>0){
   const [f,t]=monthBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});
   if(!r||!r.length){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,503,"quota_unavailable",0,0,Date.now()-t0);return openaiErr(503,"quota check unavailable, try again","api_error","quota_unavailable")}
   const s=r[0]||{prompt_tokens:0,completion_tokens:0,quota_tokens:0};const _qt=s.quota_tokens==null?null:Number(s.quota_tokens)||0;const tot=_qt!=null?_qt:((Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0));if(tot>=uRow.monthly_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"monthly_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"monthly token quota exceeded","insufficient_quota","monthly_quota_exceeded")}
  }
  // stream handling: merge stream_options
  let isStream=false;if(bodyJson&&bodyJson.stream===true) isStream=true;
  if(isStream&&bodyJson){
   bodyJson.stream_options=bodyJson.stream_options||{};bodyJson.stream_options.include_usage=true;raw=enc.encode(JSON.stringify(bodyJson));
  }
  let savedChars=0;
  if(bodyJson){
   const tsv=(req.headers.get("x-codism-token-saver")||"").trim().toLowerCase();
   const level=tsv==="off"?"off":String((kRow as any).token_saver||"off").toLowerCase();
   if((level==="trim"||level==="turbo")&&Array.isArray(bodyJson.messages)){
    const tsr=applyTokenSaver(bodyJson,level);
    bodyJson=tsr.body;savedChars=tsr.savedChars;
    raw=enc.encode(JSON.stringify(bodyJson));
   }
  }
  const start=Date.now();
  let upResp:Response|null=null;let upCt="";
  const chainInfo:any[]=[];let servedUpKeyId:string|null=null;

  let serveAbort:AbortController|null=null;
  const debugDetail=()=>{if(!kRow.debug)return null;try{return JSON.stringify({chain:chainInfo,messages:Array.isArray(bodyJson&&bodyJson.messages)?bodyJson.messages.length:0,req_bytes:raw?raw.byteLength:0}).slice(0,1800)}catch{return null}};
  let chainRes:{steps:ChainStep[]}|{error:string};
  if(evReq){
   const evSt=eventStatusOf(evState,Date.now());
   if(evSt==="ended"){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"event_ended",0,0,Date.now()-t0,debugDetail());return openaiErr(429,"The event pool has been fully spent. Follow the event page for the next event.","insufficient_quota","event_ended")}
   if(evSt!=="live"){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,404,"event_not_open",0,0,Date.now()-t0,debugDetail());return openaiErr(404,`The model '${expandedModel}' is part of an event that has not opened yet.`,"invalid_request_error","event_not_open")}

   const evUp=await getEventUpstreamRow();
   if(evUp) chainRes={steps:[{upstream_key_id:evUp.id,model:String(evState.model)}]};
   else chainRes={steps:[{upstream_key_id:uRow.upstream_key_id||null,model:String(evState.upstream_model||evState.model)}]};
  }else{
   chainRes=await loadChain((bodyJson&&typeof bodyJson.model==="string")?bodyJson.model:"",expandedModel,uRow.upstream_key_id||null);
   if("error" in chainRes){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,404,"model_not_allowed",0,0,Date.now()-t0,debugDetail());return openaiErr(404,`The model '${expandedModel}' does not exist or you do not have access to it.`,"invalid_request_error","model_not_allowed")}
  }
  for(let i=0;i<chainRes.steps.length;i++){
   const step=chainRes.steps[i];
   const up=await resolveUpstream(step);if(!up)continue;
   if(bodyJson&&typeof bodyJson==="object"&&step.model){bodyJson.model=step.model;raw=enc.encode(JSON.stringify(bodyJson));}
   const upHeaders=new Headers();upHeaders.set("authorization",`Bearer ${up.key}`);upHeaders.set("user-agent",BROWSER_UA);
   const ct=req.headers.get("content-type");if(ct) upHeaders.set("content-type",ct);else if(raw) upHeaders.set("content-type","application/json");
   const acc=req.headers.get("accept");if(acc) upHeaders.set("accept",acc);
   const controller=new AbortController();serveAbort=controller;const to=setTimeout(()=>controller.abort(),300000);const onAbort=()=>controller.abort();if(req.signal) req.signal.addEventListener("abort",onAbort,{once:true});
   let resp:Response|null=null;let wasAbort=false;
   try{resp=await fetch(up.base+"/chat/completions",{method:"POST",headers:upHeaders,body:(raw as BodyInit)||undefined,signal:controller.signal})}catch(e:any){if(e&&e.name==="AbortError")wasAbort=true;resp=null}
   clearTimeout(to);if(req.signal) req.signal.removeEventListener("abort",onAbort);

   const ms=Date.now()-start;const st=resp?resp.status:0;
   chainInfo.push({model:step.model,upstream:up.label,status:st,ms});
   const respCt=resp?(resp.headers.get("content-type")||""):"";
   const challenge=!!resp&&resp.status===403&&respCt.includes("text/html");
   const retryable=!resp||challenge||st===401||st===404||st===408||st===429||st>=500;
   if((resp&&!retryable)||i===chainRes.steps.length-1){
    upResp=resp;
    if(!upResp){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,wasAbort?504:502,wasAbort?"upstream_timeout":"upstream_error",0,0,Date.now()-t0,debugDetail());return openaiErr(wasAbort?504:502,wasAbort?"Upstream request timed out.":"AI upstream temporarily unavailable.",wasAbort?"timeout":"upstream_error",wasAbort?"upstream_timeout":"upstream_error")}
    upCt=upResp.headers.get("content-type")||"";
    servedUpKeyId=step.upstream_key_id||null;
    break;

   }
   try{if(resp)await resp.arrayBuffer()}catch{}
  }
  if(!upResp){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,502,"upstream_error",0,0,Date.now()-t0,debugDetail());return openaiErr(502,"AI upstream temporarily unavailable.","upstream_error","upstream_error")}
  const servedModel=chainInfo.length?String(chainInfo[chainInfo.length-1].model||""):(expandedModel||"");
  if(upResp.status===403&&upCt.includes("text/html")){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,502,"upstream_challenge",0,0,Date.now()-t0,debugDetail());return openaiErr(502,"AI upstream temporarily unavailable (challenge).","upstream_challenge","upstream_challenge")}
  const respHeaders=new Headers();respHeaders.set("access-control-allow-origin","*");respHeaders.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, x-codism-saved-tokens");

  for(const [k,v] of upResp.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) respHeaders.set(k,v);
  const savedTokens=Math.round(savedChars/4);
  if(savedTokens>0) respHeaders.set("x-codism-saved-tokens",String(savedTokens));
  if(upCt) respHeaders.set("content-type",upCt);else respHeaders.set("content-type","application/json");
  const isSSE=upResp.ok&&(upCt.includes("text/event-stream")||isStream);
  if(isSSE){
   respHeaders.set("cache-control","no-store");respHeaders.set("x-accel-buffering","no");
   let promptTokens=0,completionTokens=0,foundUsage=false;
   // estimate prompt tokens if needed
   let promptChars=0;if(bodyJson&&Array.isArray(bodyJson.messages)) promptChars=bodyJson.messages.map((m:any)=> (typeof m.content==="string"?m.content:JSON.stringify(m.content||""))).join(" ").length;
   let completionChars=0;
   const stream=new ReadableStream({
    async start(ctrl){
     const reader=upResp.body?.getReader();if(!reader){ctrl.close();return}
     const decoder=new TextDecoder();
     let buf="";
     try{
      while(true){
       const {done,value}=await reader.read();if(done)break;
       // capture usage from SSE chunks
       try{
        const txt=decoder.decode(value,{stream:true});
        buf+=txt;
        // try to find usage in data lines
        const lines=txt.split("\n");
        for(const line of lines){
         const tr=line.trim();if(!tr.startsWith("data:"))continue;
         const d=tr.slice(5).trim();if(!d||d==="[DONE]")continue;
         try{const j=JSON.parse(d);if(j.usage){promptTokens=Number(j.usage.prompt_tokens)||0;completionTokens=Number(j.usage.completion_tokens)||0;foundUsage=true}if(j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content) completionChars+=String(j.choices[0].delta.content).length}catch{}
        }
       }catch{}
       ctrl.enqueue(value);
      }
     }catch{}finally{
      ctrl.close();
      const latency=Date.now()-start;
      if(!foundUsage){promptTokens=Math.ceil(promptChars/4);completionTokens=Math.ceil(completionChars/4)}
      sbPost("/usage_log",{user_id:uRow.id,key_id:kRow.id,model:(evReq&&expandedModel)?expandedModel:servedModel,prompt_tokens:promptTokens,completion_tokens:completionTokens,latency_ms:latency,status:upResp.status,saved_tokens:Math.round(savedChars/4),is_event:evReq,quota_tokens:quotaTokens((evReq&&expandedModel)?expandedModel:servedModel,promptTokens,completionTokens),upstream_key_id:servedUpKeyId})
.catch((e:any)=>console.error("usage_log write failed:",e));
      logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,upResp.status,null,promptTokens,completionTokens,latency,debugDetail());
     }
    },
    cancel(){try{serveAbort?.abort()}catch{}}
   });
   return new Response(stream,{status:upResp.status,headers:respHeaders});
  }else{
   const buf=new Uint8Array(await upResp.arrayBuffer());
   let pt=0,ctok=0;try{const j=JSON.parse(dec.decode(buf));if(j.usage){pt=Number(j.usage.prompt_tokens)||0;ctok=Number(j.usage.completion_tokens)||0}}catch{}
   const latency=Date.now()-start;
   sbPost("/usage_log",{user_id:uRow.id,key_id:kRow.id,model:(evReq&&expandedModel)?expandedModel:servedModel,prompt_tokens:pt,completion_tokens:ctok,latency_ms:latency,status:upResp.status,saved_tokens:Math.round(savedChars/4),is_event:evReq,quota_tokens:quotaTokens((evReq&&expandedModel)?expandedModel:servedModel,pt,ctok),upstream_key_id:servedUpKeyId})

.catch((e:any)=>console.error("usage_log write failed:",e));
   logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,upResp.status,null,pt,ctok,latency,debugDetail());
   return new Response(buf,{status:upResp.status,headers:respHeaders});
  }
 }
 if(pathname.startsWith("/v1/")) return openaiErr(404,"Not found","invalid_request_error","not_found");
 return jsonRes(404,{error:"not found"});
 }catch(e:any){
  if(e&&e.message==="server misconfiguration") return jsonRes(500,{error:"server misconfiguration"});
  throw e;
 }
});

