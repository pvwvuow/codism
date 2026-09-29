 /*
 Codism AI Panel — Supabase Edge Function (Deno)
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
const PLANS=["starter","basic","pro","scale","unlimited"] as const;
type PlanName=typeof PLANS[number];
const PLAN_MONTHLY_TOKENS:Record<PlanName,number|null>={starter:30_000_000,basic:100_000_000,pro:200_000_000,scale:500_000_000,unlimited:null};
function planOf(v:any):PlanName|null{const s=String(v||"").toLowerCase();return (PLANS as readonly string[]).includes(s)?(s as PlanName):null}
function planQuota(p:PlanName):number|null{return PLAN_MONTHLY_TOKENS[p]}
const PLAN_RPM:Record<PlanName,number>={starter:120,basic:300,pro:600,scale:1200,unlimited:3000};
const PLAN_LABEL_FA:Record<PlanName,string>={starter:"استارتر",basic:"بیسیک",pro:"پرو",scale:"اسکیل",unlimited:"بدون سقف"};
const PLAN_PRICE_MONTHLY_USD:Record<PlanName,number>={starter:1.2,basic:3.5,pro:5.75,scale:11.5,unlimited:50};
function isSupaMisconfigured(){return !(getEnv("SUPABASE_URL")||getEnv("PANEL_SUPABASE_URL"))||!(getEnv("SUPABASE_SERVICE_ROLE")||getEnv("PANEL_SERVICE_ROLE"))}
function supaHeaders(){const k=getEnv("SUPABASE_SERVICE_ROLE")||getEnv("PANEL_SERVICE_ROLE");return{"apikey":k,"Authorization":`Bearer ${k}`,"Content-Type":"application/json"}}
function supaUrl(path:string){if(isSupaMisconfigured()) throw new Error("server misconfiguration");return `${(getEnv("SUPABASE_URL")||getEnv("PANEL_SUPABASE_URL")).replace(/\/+$/,"")}/rest/v1${path}`}
async function sbFetch(path:string,init:RequestInit={}){if(isSupaMisconfigured()) throw new Error("server misconfiguration");const h=new Headers(supaHeaders() as any);if(init.headers)for(const [kk,vv] of Object.entries(init.headers as any))h.set(kk,vv as string);const r=await fetch(supaUrl(path),{...init,headers:h});return r}
async function sbGet(path:string){const r=await sbFetch(path);if(!r.ok)return [];try{return await r.json()}catch{return []}}
async function sbPost(path:string,body:any,prefer="return=representation"){const r=await sbFetch(path,{method:"POST",headers:{"Prefer":prefer},body:JSON.stringify(body)});if(!r.ok){const t=await r.text().catch(()=>"");throw new Error(t)}try{return await r.json()}catch{return []}}
async function sbPatch(path:string,body:any){const r=await sbFetch(path,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());try{return await r.json()}catch{return []}}
async function sbDelete(path:string){const r=await sbFetch(path,{method:"DELETE"});return r.ok}
async function sbRpc(name:string,args:any){const r=await sbFetch(`/rpc/${name}`,{method:"POST",body:JSON.stringify(args)});if(!r.ok)return [];try{const j=await r.json();return Array.isArray(j)?j:[]}catch{return []}}
function logRequest(userId:string|null,keyId:string|null,route:string,method:string,model:string|null,status:number,errorCode:string|null,pt:number,ct:number,latency:number){sbPost("/request_log",{user_id:userId,key_id:keyId,route,method,model,status,error_code:errorCode,prompt_tokens:pt,completion_tokens:ct,latency_ms:latency}).catch((e:any)=>console.error("request_log write failed:",e))}
let adminEnsured=false;
async function ensureAdmin(){if(adminEnsured)return;adminEnsured=true;const email=getEnv("ADMIN_EMAIL"),pw=getEnv("ADMIN_PASSWORD");if(!email||!pw)return;try{const rows=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);if(rows.length>0)return;const h=await hashPassword(pw);await sbPost("/users",{email,name:"Admin",password_hash:h,role:"admin",enabled:true,daily_quota_tokens:0,monthly_quota_tokens:0})}catch{}}
function corsHeaders(){return{"access-control-allow-origin":"*","access-control-expose-headers":"x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens"}}
function withCors(h:Headers){if(!h.has("access-control-allow-origin"))h.set("access-control-allow-origin","*");if(!h.has("access-control-expose-headers"))h.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens");return h}
function jsonRes(status:number,obj:any,extra?:Record<string,string>){const h=withCors(new Headers({"content-type":"application/json",...(extra||{})}));return new Response(JSON.stringify(obj),{status,headers:h})}
function openaiErr(status:number,msg:string,type="invalid_request_error",code="invalid_request_error"){return jsonRes(status,{error:{message:msg,type,code}})}
function panelErr(status:number,msg:string){return jsonRes(status,{error:msg})}
async function readJson(req:Request):Promise<any>{const cl=req.headers.get("content-length");const lim=maxBodyBytes();if(cl&&parseInt(cl,10)>lim) throw new Error("body_too_large");const t=await req.text();if(t.length>lim) throw new Error("body_too_large");try{return JSON.parse(t)}catch{return {}}}
function getIp(req:Request){return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||req.headers.get("x-real-ip")||"0.0.0.0"}
const loginFails=new Map<string,number[]>();
// NOTE: per-isolate best-effort limiting (multi-isolate bypass possible) — acceptable for this scale
const regFails=new Map<string,{count:number,first:number}>();
function isRateLimited(ip:string){const arr=loginFails.get(ip)||[],now=Date.now(),win=5*60*1000;const f=arr.filter(t=>now-t<win);loginFails.set(ip,f);return f.length>=10}
function addFail(ip:string){const a=loginFails.get(ip)||[];a.push(Date.now());loginFails.set(ip,a)}
function resetFail(ip:string){loginFails.delete(ip)}
function parseAliases():Record<string,string>{try{const v=getEnv("MODEL_ALIASES");if(!v)return {};return JSON.parse(v)}catch{return {}}}
function upstreamBase(){return getEnv("UPSTREAM_BASE_URL","https://codecraftapi.com/v1").replace(/\/+$/,"")}
function maxBodyBytes(){return (parseInt(getEnv("MAX_BODY_MB","8"),10)||8)*1024*1024}
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
  h.set("access-control-allow-headers","authorization, content-type, x-api-key, x-requested-with");
  h.set("access-control-max-age","86400");
  h.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens");
  return new Response(null,{status:204,headers:h});
 }
 const norm=stripTrailing(pathname);
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
  const payload={ok:true,registration_open:getEnv("REGISTRATION_OPEN","true")!=="false",upstream:{ok,latency_ms,checked_at:new Date().toISOString()}};
  g2.__codismStatusCache={ts:now,payload};
  return jsonRes(200,payload);
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
  const ex=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);
  if(ex.length){addRegFail(ip);return jsonRes(409,{error:"email_exists",code:"email_exists"})}
  const h=await hashPassword(password);
  const plan="starter";
  const mq=planQuota(plan);
  let ins:any;try{ins=await sbPost("/users",{email,name,password_hash:h,role:"user",enabled:true,plan,daily_quota_tokens:0,monthly_quota_tokens:mq||0,phone:body.phone||null})}catch(e:any){console.error("register insert failed:",String(e.message||e));const msg=String(e.message||"");if(msg.includes("duplicate")||msg.includes("23505")||msg.includes("already exists")){addRegFail(ip);return jsonRes(409,{error:"email_exists",code:"email_exists"})}return jsonRes(400,{error:"create_failed",code:"create_failed"})}
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
  const rows=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id,email,name,password_hash,role,enabled,daily_quota_tokens,monthly_quota_tokens`);
  const user=rows[0];
  if(!user){addFail(ip);return panelErr(401,"Invalid credentials")}
  if(!user.enabled){addFail(ip);return panelErr(403,"Account disabled")}
  const ok=await verifyPassword(password,user.password_hash);
  if(!ok){addFail(ip);return panelErr(401,"Invalid credentials")}
  resetFail(ip);
  const exp=Math.floor(Date.now()/1000)+12*3600;
  const token=await jwtSign({sub:user.id,email:user.email,role:user.role,exp},getEnv("JWT_SECRET"));
  return jsonRes(200,{token,user:{id:user.id,email:user.email,name:user.name,role:user.role,daily_quota_tokens:user.daily_quota_tokens,monthly_quota_tokens:user.monthly_quota_tokens}});
 }
 // helper to auth
 async function authOr401():Promise<any>{
  const p=await requireJwt(req);
  if(!p) return null;
  // verify user still enabled
  const rows=await sbGet(`/users?id=eq.${encodeURIComponent(p.sub)}&select=id,email,name,role,enabled,plan,daily_quota_tokens,monthly_quota_tokens`);
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
  const rows=await sbGet(`/api_keys?user_id=eq.${encodeURIComponent(a.sub)}&select=id,label,key,enabled,models,created_at&order=created_at.desc`);
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
  const active=await sbGet(`/api_keys?user_id=eq.${encodeURIComponent(a.sub)}&enabled=eq.true&select=id`);
  if(active.length>=10) return panelErr(429,"max 10 active keys");
  const rand=hexEncode(crypto.getRandomValues(new Uint8Array(16)));
  const key="codism_"+rand;
  if(!label) label="کلید "+rand.slice(0,4);
  const ins=await sbPost("/api_keys",{user_id:a.sub,key,label,enabled:true,models});
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
 // /api/usage
 if(norm==="/api/usage"&&method==="GET"){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  const days=Math.min(90,Math.max(1,parseInt(url.searchParams.get("days")||"14",10)||14));
  const [tFrom,tTo]=todayBounds(),[mFrom,mTo]=monthBounds();
  const [by,td,mo,bm]=await Promise.all([sbRpc("usage_by_day",{p_user:a.sub,p_days:days,p_offset_min:TZ_OFF_MIN}),sbRpc("usage_sum",{p_user:a.sub,p_from:tFrom,p_to:tTo}),sbRpc("usage_sum",{p_user:a.sub,p_from:mFrom,p_to:mTo}),sbRpc("usage_by_model",{p_user:a.sub,p_days:days,p_offset_min:TZ_OFF_MIN})]);
  const recent=await sbGet(`/request_log?user_id=eq.${encodeURIComponent(a.sub)}&select=ts,route,model,status,error_code,prompt_tokens,completion_tokens,latency_ms&order=ts.desc&limit=25`);
  return jsonRes(200,{by_day:by,by_model:bm,today:td[0]||{prompt_tokens:0,completion_tokens:0,requests:0},month:mo[0]||{prompt_tokens:0,completion_tokens:0,requests:0},recent});
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
 // admin routes
 if(pathname.startsWith("/api/admin/")){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  if(a.role!=="admin") return panelErr(403,"Admin only");
  if(norm==="/api/admin/users"&&method==="GET"){
   const users=await sbGet(`/users?select=id,email,name,role,enabled,plan,daily_quota_tokens,monthly_quota_tokens,created_at&order=created_at.desc`);
   const keys=await sbGet(`/api_keys?select=user_id`);
   const cnt=new Map<string,number>();for(const k of keys) cnt.set(k.user_id,(cnt.get(k.user_id)||0)+1);
   const out=users.map((u:any)=>({id:u.id,email:u.email,name:u.name,role:u.role,enabled:u.enabled,plan:u.plan||"starter",daily_quota_tokens:u.daily_quota_tokens,monthly_quota_tokens:u.monthly_quota_tokens,created_at:u.created_at,key_count:cnt.get(u.id)||0}));
   return jsonRes(200,out);
  }
  if(norm==="/api/admin/users"&&method==="POST"){
   let b:any;try{b=await readJson(req)}catch(e:any){if(String(e.message)==="body_too_large")return panelErr(413,"body too large");b={}}
   const email=(b.email||"").trim(),name=(b.name||"").trim(),password=b.password||"",role=b.role==="admin"?"admin":"user";
   if(!email||!password||!name) return panelErr(400,"missing fields");
   const ex=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);
   if(ex.length) return panelErr(409,"email exists");
   const h=await hashPassword(password);
   const plan=planOf(b.plan||"starter");
   if(!plan) return panelErr(400,"invalid plan");
   const mq=planQuota(plan);
   const dq:any=0;
   try{const ins=await sbPost("/users",{email,name,password_hash:h,role,enabled:true,plan,daily_quota_tokens:dq,monthly_quota_tokens:mq||0});return jsonRes(200,ins[0]||{ok:true})}catch(e:any){console.error("admin create user failed:",String(e.message||e));const m2=String(e.message||"");if(m2.includes("duplicate")||m2.includes("23505"))return panelErr(409,"email exists");return panelErr(400,"create failed")}
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
   if(b.plan!==undefined){const pl=planOf(b.plan);if(!pl) return panelErr(400,"invalid plan");patch.plan=pl;if(b.monthly_quota_tokens===undefined)patch.monthly_quota_tokens=planQuota(pl)||0;if(b.daily_quota_tokens===undefined)patch.daily_quota_tokens=0}
   if(Object.keys(patch).length===0) return panelErr(400,"no fields");
   await sbPatch(`/users?id=eq.${encodeURIComponent(id)}`,patch);
   return jsonRes(200,{ok:true});
  }
  if(pathname.startsWith("/api/admin/users/")&&method==="DELETE"){
   const id=pathname.split("/")[4];
   if(id===a.sub) return panelErr(403,"cannot delete self");
   await sbDelete(`/users?id=eq.${encodeURIComponent(id)}`);
   return jsonRes(200,{ok:true});
  }
  if(norm==="/api/admin/stats"&&method==="GET"){
   const [totals,by]=await Promise.all([sbRpc("admin_totals",{p_offset_min:TZ_OFF_MIN}),sbRpc("admin_usage_by_day",{p_days:14,p_offset_min:TZ_OFF_MIN})]);
   return jsonRes(200,{totals:totals[0]||{users:0,keys:0,active_keys:0,requests_today:0,tokens_today:0,failed_today:0},by_day:by});
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
  const uRows=await sbGet(`/users?id=eq.${encodeURIComponent(kRow.user_id)}&select=id,enabled`);
  const uRow=uRows[0];if(!uRow||!uRow.enabled){logRequest(uRow?uRow.id:null,kRow.id,"/v1/models",method,null,403,"user_disabled",0,0,Date.now()-t0);return openaiErr(403,"User disabled.","insufficient_quota","user_disabled")}
  const aliases=parseAliases();
  const synthetic=Object.keys(aliases).map(id=>({id,object:"model",created:1700000000,owned_by:"codism-panel"}));
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
    const data=await up.json();const list=Array.isArray(data.data)?data.data:[];for(const s of synthetic)list.push(s);const filtered=filterList(list);const out={object:"list",data:filtered};const h=withCors(new Headers({"content-type":"application/json"}));for(const [k,v] of up.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) h.set(k,v);return new Response(JSON.stringify(out),{status:200,headers:h});
   }
  }catch{}
  return jsonRes(200,{object:"list",data:filterList(synthetic.slice())});
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
  const kRows=await sbGet(`/api_keys?key=eq.${encodeURIComponent(keyText)}&select=id,user_id,enabled,models`);
  const kRow=kRows[0];if(!kRow){logRequest(null,null,"/v1/chat/completions",method,null,401,"invalid_api_key",0,0,Date.now()-t0);return openaiErr(401,"Invalid API key.","invalid_request_error","invalid_api_key")}
  if(!kRow.enabled){logRequest(kRow.user_id,kRow.id,"/v1/chat/completions",method,null,403,"key_disabled",0,0,Date.now()-t0);return openaiErr(403,"This API key has been disabled.","insufficient_quota","key_disabled")}
  const uRows=await sbGet(`/users?id=eq.${encodeURIComponent(kRow.user_id)}&select=id,enabled,daily_quota_tokens,monthly_quota_tokens`);
  const uRow=uRows[0];if(!uRow||!uRow.enabled){logRequest(uRow?uRow.id:null,kRow.id,"/v1/chat/completions",method,null,403,"user_disabled",0,0,Date.now()-t0);return openaiErr(403,"User disabled.","insufficient_quota","user_disabled")}
  let bodyJson:any=null;if(raw)try{bodyJson=JSON.parse(dec.decode(raw))}catch{}
  const aliases=parseAliases();
  let expandedModel=bodyJson?.model||"";
  if(typeof expandedModel==="string"&&aliases[expandedModel]) expandedModel=aliases[expandedModel];
  // model gate
  const modelsStr=(kRow.models||"*").trim();
  if(modelsStr!=="*"&&modelsStr!==""){
   const set=new Set(modelsStr.split(",").map((s:string)=>s.trim()).filter(Boolean));
   const rawModel=(bodyJson&&typeof bodyJson.model==="string")?bodyJson.model:"";
   if(expandedModel&&!set.has(expandedModel)&&!set.has("*")&&!set.has(rawModel)){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel,404,"model_not_allowed",0,0,Date.now()-t0);return openaiErr(404,`The model '${expandedModel}' does not exist or you do not have access to it.`,"invalid_request_error","model_not_allowed")}
  }
  if(bodyJson&&typeof bodyJson.model==="string"&&expandedModel!==bodyJson.model){bodyJson.model=expandedModel;raw=enc.encode(JSON.stringify(bodyJson))}
  // quota
  if((uRow.daily_quota_tokens||0)>0){
   const [f,t]=todayBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});
   if(!r||!r.length){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,503,"quota_unavailable",0,0,Date.now()-t0);return openaiErr(503,"quota check unavailable, try again","api_error","quota_unavailable")}
   const s=r[0]||{prompt_tokens:0,completion_tokens:0};const tot=(Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0);if(tot>=uRow.daily_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"daily_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"daily token quota exceeded","insufficient_quota","daily_quota_exceeded")}
  }
  if((uRow.monthly_quota_tokens||0)>0){
   const [f,t]=monthBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});
   if(!r||!r.length){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,503,"quota_unavailable",0,0,Date.now()-t0);return openaiErr(503,"quota check unavailable, try again","api_error","quota_unavailable")}
   const s=r[0]||{prompt_tokens:0,completion_tokens:0};const tot=(Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0);if(tot>=uRow.monthly_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"monthly_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"monthly token quota exceeded","insufficient_quota","monthly_quota_exceeded")}
  }
  // stream handling: merge stream_options
  let isStream=false;if(bodyJson&&bodyJson.stream===true) isStream=true;
  if(isStream&&bodyJson){
   bodyJson.stream_options=bodyJson.stream_options||{};bodyJson.stream_options.include_usage=true;raw=enc.encode(JSON.stringify(bodyJson));
  }
  const target=upstreamBase()+"/chat/completions";
  const upHeaders=new Headers();upHeaders.set("authorization",`Bearer ${getEnv("UPSTREAM_API_KEY")}`);upHeaders.set("user-agent",BROWSER_UA);
  const ct=req.headers.get("content-type");if(ct) upHeaders.set("content-type",ct);else if(raw) upHeaders.set("content-type","application/json");
  const acc=req.headers.get("accept");if(acc) upHeaders.set("accept",acc);
  const controller=new AbortController();const to=setTimeout(()=>controller.abort(),300000);if(req.signal) req.signal.addEventListener("abort",()=>controller.abort(),{once:true});
  const start=Date.now();
  let upResp:Response;
  try{
   upResp=await fetch(target,{method:"POST",headers:upHeaders,body:(raw as BodyInit)||undefined,signal:controller.signal});
  }catch(e:any){
   clearTimeout(to);
   const isAbort=e&&e.name==="AbortError";
   logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,isAbort?504:502,isAbort?"upstream_timeout":"upstream_error",0,0,Date.now()-t0);
   return openaiErr(isAbort?504:502,isAbort?"Upstream request timed out.":"AI upstream temporarily unavailable.",isAbort?"timeout":"upstream_error",isAbort?"upstream_timeout":"upstream_error");
  }
  clearTimeout(to);
  const upCt=upResp.headers.get("content-type")||"";
  if(upResp.status===403&&upCt.includes("text/html")){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,502,"upstream_challenge",0,0,Date.now()-t0);return openaiErr(502,"AI upstream temporarily unavailable (challenge).","upstream_challenge","upstream_challenge")}
  const respHeaders=new Headers();respHeaders.set("access-control-allow-origin","*");respHeaders.set("access-control-expose-headers","x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens");
  for(const [k,v] of upResp.headers.entries()) if(k.toLowerCase().startsWith("x-ratelimit-")) respHeaders.set(k,v);
  if(upCt) respHeaders.set("content-type",upCt);else respHeaders.set("content-type","application/json");
  const isSSE=upCt.includes("text/event-stream")||isStream;
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
      sbPost("/usage_log",{user_id:uRow.id,key_id:kRow.id,model:expandedModel||"",prompt_tokens:promptTokens,completion_tokens:completionTokens,latency_ms:latency,status:upResp.status}).catch((e:any)=>console.error("usage_log write failed:",e));
      logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,upResp.status,null,promptTokens,completionTokens,latency);
     }
    },
    cancel(){try{controller.abort()}catch{}}
   });
   return new Response(stream,{status:upResp.status,headers:respHeaders});
  }else{
   const buf=new Uint8Array(await upResp.arrayBuffer());
   let pt=0,ctok=0;try{const j=JSON.parse(dec.decode(buf));if(j.usage){pt=Number(j.usage.prompt_tokens)||0;ctok=Number(j.usage.completion_tokens)||0}}catch{}
   const latency=Date.now()-start;
   sbPost("/usage_log",{user_id:uRow.id,key_id:kRow.id,model:expandedModel||"",prompt_tokens:pt,completion_tokens:ctok,latency_ms:latency,status:upResp.status}).catch((e:any)=>console.error("usage_log write failed:",e));
   logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,upResp.status,null,pt,ctok,latency);
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

