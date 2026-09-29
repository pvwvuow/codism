/*
 Codism AI Panel — Supabase Edge Function (Deno)
 Env vars:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE, UPSTREAM_API_KEY, UPSTREAM_BASE_URL (default https://codecraftapi.com/v1),
  MODEL_ALIASES (JSON), JWT_SECRET (>=32 chars), ADMIN_EMAIL, ADMIN_PASSWORD, MAX_BODY_MB (default 8),
  PANEL_UI_URL (default https://pvwvuow.github.io/codism/)
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
function getIp(req:Request){return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||req.headers.get("x-real-ip")||"0.0.0.0"}
const loginFails=new Map<string,number[]>();
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
const HTML=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codism AI Panel</title><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Tahoma;background:#0a0a0f;color:#e5e7eb}header{position:sticky;top:0;background:#111119;border-bottom:1px solid #222;display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:56px}nav{display:flex;gap:6px;padding:8px 12px;background:#111119;border-bottom:1px solid #222;overflow:auto}nav button{border:1px solid #2a2a3a;background:#1a1a27;color:#cbd5e1;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap}nav button.active{background:#7c3aed;color:#fff;border-color:#7c3aed}main{max-width:1100px;margin:0 auto;padding:16px}card{background:#15151f;border:1px solid #232334;border-radius:16px;padding:14px}grid{display:grid;gap:10px}g2{grid-template-columns:repeat(2,1fr)}g4{grid-template-columns:repeat(4,1fr)}@media(max-width:700px){g4{grid-template-columns:repeat(2,1fr)}}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #232334;text-align:right}th{color:#94a3b8;font-weight:600}input,select,textarea{width:100%;background:#0f0f18;border:1px solid #2a2a3a;color:#e5e7eb;border-radius:10px;padding:8px 10px;font-size:13px}button.primary{background:#7c3aed;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer}button.ghost{background:#1a1a27;border:1px solid #2a2a3a;color:#e5e7eb;border-radius:10px;padding:6px 10px;cursor:pointer}.badge{padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid #2a2a3a}.ok{background:#052e1a;color:#86efac;border-color:#14532d}.bad{background:#2a1212;color:#fca5a5}.muted{color:#94a3b8;font-size:12px}.ltr{direction:ltr;text-align:left;font-family:ui-monospace,monospace}pre{background:#0f0f18;border:1px solid #232334;border-radius:12px;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}.hidden{display:none!important}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.kpi{font-weight:800;font-size:18px}</style></head><body>
<header><b style="letter-spacing:1px">CODISM</b><span id="baseUrl" class="ltr" style="background:#000;color:#34d399;padding:4px 8px;border-radius:8px;font-size:11px">/v1</span><div class="row"><span id="meInfo" class="muted"></span><button class="ghost" onclick="logout()">خروج</button></div></header>
<nav><button data-n="keys" onclick="go('keys')">کلیدها</button><button data-n="usage" onclick="go('usage')">مصرف من</button><button data-n="guide" onclick="go('guide')">راهنما</button><button data-n="admin-users" id="navAdminUsers" class="hidden" onclick="go('admin-users')">کاربران</button><button data-n="admin-stats" id="navAdminStats" class="hidden" onclick="go('admin-stats')">آمار کل</button></nav>
<main>
<section id="view-login"><div style="min-height:60vh;display:grid;place-items:center"><div class="card" style="width:100%;max-width:420px"><h2 style="margin:0 0 6px">ورود به پنل</h2><p class="muted">Codism AI Panel — ورود با ایمیل و رمز</p><div style="display:grid;gap:10px;margin-top:12px"><input id="le" placeholder="ایمیل" class="ltr"><input id="lp" type="password" placeholder="رمز عبور"><button class="primary" onclick="doLogin()">ورود</button><div id="loginMsg" class="muted" style="color:#fca5a5"></div></div></div></div></section>
<section id="view-keys" class="hidden"><div class="row" style="justify-content:space-between"><h3>کلیدهای من</h3><button class="primary" onclick="createKey()">+ ساخت کلید</button></div><div class="row" style="margin:8px 0"><input id="kLabel" placeholder="برچسب کلید (مثلا my-app)" style="max-width:260px"><button class="ghost" onclick="createKey()">ایجاد</button></div><div class="card"><table><thead><tr><th>برچسب</th><th>کلید</th><th>وضعیت</th><th>مدل‌ها</th><th>تاریخ</th><th>حذف</th></tr></thead><tbody id="keysBody"></tbody></table></div></section>
<section id="view-usage" class="hidden"><div class="grid g4" style="margin-bottom:10px"><div class="card"><div class="muted">امروز — توکن</div><div id="uTodayTok" class="kpi">-</div><div id="uTodayReq" class="muted">-</div></div><div class="card"><div class="muted">این ماه — توکن</div><div id="uMonthTok" class="kpi">-</div><div id="uMonthReq" class="muted">-</div></div><div class="card"><div class="muted">روزهای اخیر</div><div id="uDays" class="kpi">14</div></div><div class="card"><button class="ghost" onclick="loadUsage()">بروزرسانی</button></div></div><div class="card"><table><thead><tr><th>روز</th><th>درخواست</th><th>prompt</th><th>completion</th></tr></thead><tbody id="usageBody"></tbody></table></div><div class="card" style="margin-top:10px"><h4>درخواست‌های اخیر</h4><p class="muted">اگر مصرف صفر است، اینجا را ببینید — درخواست‌های ناموفق هم ثبت می‌شوند</p><table><thead><tr><th>زمان</th><th>مسیر</th><th>مدل</th><th>وضعیت</th><th>جزئیات</th></tr></thead><tbody id="recentBody"></tbody></table></div></section>
<section id="view-guide" class="hidden"><div class="card"><h3>راهنما</h3><p class="muted">آدرس پایه شما:</p><code id="guideBase" class="ltr" style="display:block;background:#000;color:#34d399;padding:8px;border-radius:8px"></code><p class="muted">نمونه curl:</p><pre id="guideCurl" class="ltr"></pre><p class="muted">Python:</p><pre class="ltr">from openai import OpenAI
client=OpenAI(base_url=BASE+"/v1",api_key="codism_XXX")
client.chat.completions.create(model="gpt-4o-mini",messages=[{"role":"user","content":"سلام"}])</pre><p class="muted">JS:</p><pre class="ltr">import OpenAI from "openai"
const client=new OpenAI({baseURL:BASE+"/v1",apiKey:"codism_XXX"})
await client.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"user",content:"hi"}]})</pre><div class="row"><select id="guideKeySel" class="ltr" style="max-width:360px"></select><button class="ghost" onclick="refreshGuide()">اعمال کلید</button></div></div></section>
<section id="view-admin-users" class="hidden"><div class="row" style="justify-content:space-between"><h3>کاربران</h3></div><div class="card"><table><thead><tr><th>ایمیل</th><th>نام</th><th>نقش</th><th>فعال</th><th>سهمیه روزانه</th><th>سهمیه ماهانه</th><th>کلیدها</th><th>عملیات</th></tr></thead><tbody id="adminUsersBody"></tbody></table></div><div class="card" style="margin-top:10px"><h4>ایجاد کاربر</h4><div class="grid g4"><input id="auEmail" placeholder="ایمیل" class="ltr"><input id="auName" placeholder="نام"><input id="auPass" placeholder="رمز" type="password"><select id="auRole"><option value="user">user</option><option value="admin">admin</option></select></div><div class="grid g2" style="margin-top:8px"><input id="auDaily" type="number" placeholder="سهمیه روزانه (0=نامحدود)"><input id="auMonthly" type="number" placeholder="سهمیه ماهانه (0=نامحدود)"></div><div style="margin-top:8px"><button class="primary" onclick="adminCreateUser()">ایجاد</button><span id="auMsg" class="muted"></span></div></div></section>
<section id="view-admin-stats" class="hidden"><div class="grid g4"><div class="card"><div class="muted">کاربران</div><div id="stUsers" class="kpi">-</div></div><div class="card"><div class="muted">کلیدها</div><div id="stKeys" class="kpi">-</div></div><div class="card"><div class="muted">کلید فعال</div><div id="stActive" class="kpi">-</div></div><div class="card"><div class="muted">درخواست امروز</div><div id="stReq" class="kpi">-</div></div><div class="card"><div class="muted">ناموفق امروز</div><div id="stFailed" class="kpi">-</div></div></div><div class="card" style="margin-top:10px"><div class="muted">توکن امروز</div><div id="stTok" class="kpi">-</div></div><div class="card" style="margin-top:10px"><table><thead><tr><th>روز</th><th>درخواست</th><th>توکن</th></tr></thead><tbody id="adminStatsBody"></tbody></table></div></section>
</main>
<script>
let token=localStorage.getItem("codism_token")||"",cur=null,keys=[];
const API_BASE=(typeof window!=="undefined"&&window.CODISM_API_BASE)||"";
function api(p,o={}){o.headers=o.headers||{};if(token)o.headers["Authorization"]="Bearer "+token;if(o.body&&typeof o.body==="object"){o.headers["Content-Type"]="application/json";o.body=JSON.stringify(o.body)}return fetch(API_BASE+p,o).then(async r=>{const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={raw:t}};if(!r.ok)throw new Error((j&&j.error)||t.slice(0,300));return j})}
function show(id){document.querySelectorAll("main>section").forEach(s=>s.classList.add("hidden"));document.getElementById("view-"+id).classList.remove("hidden");document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.n===id))}
function go(h){location.hash="#/"+h}
function route(){const h=location.hash.replace(/^#\\/?/,"")||"keys";if(!token){show("login");return}if(h==="login"){show("keys");return}if(h.startsWith("admin")&&cur&&cur.role!=="admin"){show("keys");return}if(document.getElementById("view-"+h))show(h);else show("keys");if(h==="keys")loadKeys();if(h==="usage")loadUsage();if(h==="guide")refreshGuide();if(h==="admin-users")loadAdminUsers();if(h==="admin-stats")loadAdminStats()}
async function doLogin(){const e=document.getElementById("le").value.trim(),p=document.getElementById("lp").value;document.getElementById("loginMsg").textContent="";try{const j=await api("/api/auth/login",{method:"POST",body:{email:e,password:p}});token=j.token;localStorage.setItem("codism_token",token);await boot()}catch(e){document.getElementById("loginMsg").textContent=e.message}}
function logout(){localStorage.removeItem("codism_token");token="";cur=null;location.hash="#/login";show("login")}
async function boot(){if(!token){show("login");return}try{const j=await api("/api/me");cur=j.user;document.getElementById("meInfo").textContent=cur.email+" ("+cur.role+")";if(cur.role==="admin"){document.getElementById("navAdminUsers").classList.remove("hidden");document.getElementById("navAdminStats").classList.remove("hidden")}const base=(API_BASE||(location.origin+"/functions/v1/panel"))+"/v1";document.getElementById("baseUrl").textContent=base;document.getElementById("guideBase").textContent=base;route()}catch{logout()}}
async function loadKeys(){try{keys=await api("/api/keys");const tb=document.getElementById("keysBody");tb.innerHTML=keys.map(k=>{const masked=k.key?k.key.slice(0,12)+"..."+k.key.slice(-4):"-";return \`<tr><td>\${k.label||"-"}</td><td class="ltr"><span>\${masked}</span> <button class="ghost" onclick="copyKey('\${k.key}')">کپی</button></td><td><span class="badge \${k.enabled?"ok":"bad"}">\${k.enabled?"فعال":"غیرفعال"}</span></td><td class="ltr">\${k.models||"*"}</td><td>\${new Date(k.created_at).toLocaleString("fa-IR")}</td><td><button class="ghost" onclick="delKey('\${k.id}')">حذف</button></td></tr>\`}).join("")||'<tr><td colspan=6 class="muted">کلیدی نیست</td></tr>';const sel=document.getElementById("guideKeySel");if(sel)sel.innerHTML=keys.map(k=>\`<option value="\${k.key}">\${k.label||k.key.slice(0,12)}</option>\`).join("");refreshGuide()}catch(e){}}
async function createKey(){const label=document.getElementById("kLabel").value.trim();try{await api("/api/keys",{method:"POST",body:{label}});document.getElementById("kLabel").value="";loadKeys()}catch(e){alert(e.message)}}
async function delKey(id){if(!confirm("حذف کلید؟"))return;await api("/api/keys/"+id,{method:"DELETE"});loadKeys()}
function copyKey(k){navigator.clipboard.writeText(k);alert("کپی شد")}
async function loadUsage(){try{const j=await api("/api/usage?days=14");document.getElementById("uTodayTok").textContent=(j.today.prompt_tokens+j.today.completion_tokens);document.getElementById("uTodayReq").textContent=j.today.requests+" درخواست";document.getElementById("uMonthTok").textContent=(j.month.prompt_tokens+j.month.completion_tokens);document.getElementById("uMonthReq").textContent=j.month.requests+" درخواست";document.getElementById("usageBody").innerHTML=j.by_day.map(r=>\`<tr><td>\${r.day.slice(0,10)}</td><td>\${r.requests}</td><td>\${r.prompt_tokens}</td><td>\${r.completion_tokens}</td></tr>\`).join("");const rb=document.getElementById("recentBody");if(rb){const hints={invalid_api_key:"کلید نامعتبر",missing_api_key:"کلید ارسال نشده",key_disabled:"کلید غیرفعال",user_disabled:"حساب غیرفعال",model_not_allowed:"این مدل برای کلید شما مجاز نیست",daily_quota_exceeded:"سهمیه روزانه تمام شد",monthly_quota_exceeded:"سهمیه ماهانه تمام شد",upstream_challenge:"سرویس موقتا در دسترس نیست",upstream_error:"سرویس موقتا در دسترس نیست",upstream_timeout:"پاسخ سرویس طولانی شد",body_too_large:"حجم درخواست بیش از حد",not_found:"مسیر اشتباه"};rb.innerHTML=(j.recent||[]).map(q=>\`<tr><td>\${new Date(q.ts).toLocaleString("fa-IR")}</td><td class="ltr">\${q.route}</td><td class="ltr">\${q.model||"-"}</td><td><span class="badge \${q.status<400?"ok":"bad"}">\${q.status}</span></td><td>\${q.status<400?((q.prompt_tokens+q.completion_tokens)+" توکن"):(hints[q.error_code]||q.error_code||"-")}</td></tr>\`).join("")||'<tr><td colspan=5 class="muted">موردی ثبت نشده</td></tr>'}}catch(e){}}
function refreshGuide(){const base=(API_BASE||(location.origin+"/functions/v1/panel"))+"/v1";
const sel=document.getElementById("guideKeySel");const key=sel&&sel.value?sel.value:"codism_XXX";document.getElementById("guideCurl").textContent='curl '+base+'/chat/completions -H "Authorization: Bearer '+key+'" -H "Content-Type: application/json" -d \'{"model":"gpt-4o-mini","messages":[{"role":"user","content":"سلام"}]}\''}
async function loadAdminUsers(){try{const rows=await api("/api/admin/users");document.getElementById("adminUsersBody").innerHTML=rows.map(u=>\`<tr><td class="ltr">\${u.email}</td><td>\${u.name||""}</td><td>\${u.role}</td><td><button class="ghost" onclick="toggleUser('\${u.id}',\${!u.enabled})">\${u.enabled?"فعال":"غیرفعال"}</button></td><td><input class="ltr" style="width:110px" value="\${u.daily_quota_tokens||0}" onchange="editQuota('\${u.id}','daily',this.value)"></td><td><input class="ltr" style="width:110px" value="\${u.monthly_quota_tokens||0}" onchange="editQuota('\${u.id}','monthly',this.value)"></td><td>\${u.key_count||0}</td><td><button class="ghost" onclick="resetPw('\${u.id}')">رمز</button> <button class="ghost" onclick="delUser('\${u.id}')">حذف</button></td></tr>\`).join("")}catch(e){document.getElementById("adminUsersBody").innerHTML='<tr><td colspan=8>'+e.message+'</td></tr>'}}
async function adminCreateUser(){const body={email:auEmail.value.trim(),name:auName.value.trim(),password:auPass.value,role:auRole.value,daily_quota_tokens:parseInt(auDaily.value||"0",10),monthly_quota_tokens:parseInt(auMonthly.value||"0",10)};document.getElementById("auMsg").textContent="";try{await api("/api/admin/users",{method:"POST",body});auEmail.value="";auName.value="";auPass.value="";loadAdminUsers()}catch(e){document.getElementById("auMsg").textContent=e.message}}
async function toggleUser(id,enabled){try{await api("/api/admin/users/"+id,{method:"PATCH",body:{enabled}});loadAdminUsers()}catch(e){alert(e.message)}}
async function editQuota(id,kind,val){const body={};if(kind==="daily")body.daily_quota_tokens=parseInt(val,10);else body.monthly_quota_tokens=parseInt(val,10);try{await api("/api/admin/users/"+id,{method:"PATCH",body})}catch(e){alert(e.message)}}
async function resetPw(id){const p=prompt("رمز جدید:");if(!p)return;try{await api("/api/admin/users/"+id,{method:"PATCH",body:{password:p}});alert("انجام شد")}catch(e){alert(e.message)}}
async function delUser(id){if(!confirm("حذف کاربر؟"))return;try{await api("/api/admin/users/"+id,{method:"DELETE"});loadAdminUsers()}catch(e){alert(e.message)}}
async function loadAdminStats(){try{const j=await api("/api/admin/stats");document.getElementById("stUsers").textContent=j.totals.users;document.getElementById("stKeys").textContent=j.totals.keys;document.getElementById("stActive").textContent=j.totals.active_keys;document.getElementById("stReq").textContent=j.totals.requests_today;document.getElementById("stTok").textContent=j.totals.tokens_today;const sf=document.getElementById("stFailed");if(sf)sf.textContent=j.totals.failed_today??0;document.getElementById("adminStatsBody").innerHTML=j.by_day.map(r=>\`<tr><td>\${r.day.slice(0,10)}</td><td>\${r.requests}</td><td>\${r.tokens}</td></tr>\`).join("")}catch(e){}}
window.addEventListener("hashchange",route);boot();
</script></body></html>`;

Deno.serve(async (req:Request)=>{
 try{
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
 // health
 if(norm==="/health"&&method==="GET") return jsonRes(200,{ok:true,service:"codism-panel"});
 if(norm==="/"&&(method==="GET"||method==="HEAD")) return new Response(null,{status:302,headers:withCors(new Headers({location:getEnv("PANEL_UI_URL","https://pvwvuow.github.io/codism/"),"cache-control":"no-store"}))});
 // login
 if(norm==="/api/auth/login"&&method==="POST"){
  const ip=getIp(req);
  if(isRateLimited(ip)) return panelErr(429,"Too many attempts");
  let body:any={};try{body=await req.json()}catch{}
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
  const rows=await sbGet(`/users?id=eq.${encodeURIComponent(p.sub)}&select=id,email,name,role,enabled,daily_quota_tokens,monthly_quota_tokens`);
  if(!rows[0]||!rows[0].enabled) return null;
  return {...p,db:rows[0]};
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
  let b:any={};try{b=await req.json()}catch{}
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
  const [by,td,mo]=await Promise.all([sbRpc("usage_by_day",{p_user:a.sub,p_days:days,p_offset_min:TZ_OFF_MIN}),sbRpc("usage_sum",{p_user:a.sub,p_from:tFrom,p_to:tTo}),sbRpc("usage_sum",{p_user:a.sub,p_from:mFrom,p_to:mTo})]);
  const recent=await sbGet(`/request_log?user_id=eq.${encodeURIComponent(a.sub)}&select=ts,route,model,status,error_code,prompt_tokens,completion_tokens,latency_ms&order=ts.desc&limit=25`);
  return jsonRes(200,{by_day:by,today:td[0]||{prompt_tokens:0,completion_tokens:0,requests:0},month:mo[0]||{prompt_tokens:0,completion_tokens:0,requests:0},recent});
 }
 // admin routes
 if(pathname.startsWith("/api/admin/")){
  const a=await authOr401();if(!a) return panelErr(401,"Unauthorized");
  if(a.role!=="admin") return panelErr(403,"Admin only");
  if(norm==="/api/admin/users"&&method==="GET"){
   const users=await sbGet(`/users?select=id,email,name,role,enabled,daily_quota_tokens,monthly_quota_tokens,created_at&order=created_at.desc`);
   const keys=await sbGet(`/api_keys?select=user_id`);
   const cnt=new Map<string,number>();for(const k of keys) cnt.set(k.user_id,(cnt.get(k.user_id)||0)+1);
   const out=users.map((u:any)=>({id:u.id,email:u.email,name:u.name,role:u.role,enabled:u.enabled,daily_quota_tokens:u.daily_quota_tokens,monthly_quota_tokens:u.monthly_quota_tokens,created_at:u.created_at,key_count:cnt.get(u.id)||0}));
   return jsonRes(200,out);
  }
  if(norm==="/api/admin/users"&&method==="POST"){
   let b:any={};try{b=await req.json()}catch{}
   const email=(b.email||"").trim(),name=(b.name||"").trim(),password=b.password||"",role=b.role==="admin"?"admin":"user",dq=parseInt(b.daily_quota_tokens??0,10)||0,mq=parseInt(b.monthly_quota_tokens??0,10)||0;
   if(!email||!password||!name) return panelErr(400,"missing fields");
   const ex=await sbGet(`/users?email=eq.${encodeURIComponent(email)}&select=id`);
   if(ex.length) return panelErr(409,"email exists");
   const h=await hashPassword(password);
   try{const ins=await sbPost("/users",{email,name,password_hash:h,role,enabled:true,daily_quota_tokens:dq,monthly_quota_tokens:mq});return jsonRes(200,ins[0]||{ok:true})}catch(e:any){return panelErr(400,String(e.message||e))}
  }
  if(pathname.startsWith("/api/admin/users/")&&method==="PATCH"){
   const id=pathname.split("/")[4];
   let b:any={};try{b=await req.json()}catch{}
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
   const [f,t]=todayBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});const s=r[0]||{prompt_tokens:0,completion_tokens:0};const tot=(Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0);if(tot>=uRow.daily_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"daily_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"daily token quota exceeded","insufficient_quota","daily_quota_exceeded")}
  }
  if((uRow.monthly_quota_tokens||0)>0){
   const [f,t]=monthBounds();const r=await sbRpc("usage_sum",{p_user:uRow.id,p_from:f,p_to:t});const s=r[0]||{prompt_tokens:0,completion_tokens:0};const tot=(Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0);if(tot>=uRow.monthly_quota_tokens){logRequest(uRow.id,kRow.id,"/v1/chat/completions",method,expandedModel||null,429,"monthly_quota_exceeded",0,0,Date.now()-t0);return openaiErr(429,"monthly token quota exceeded","insufficient_quota","monthly_quota_exceeded")}
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

