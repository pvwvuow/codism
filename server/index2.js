import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { authRequired, adminOnly } from './auth.js';
import { proxyToUpstream } from './proxy.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
export function registerPart2(app){
app.get('/api/admin/users',authRequired,adminOnly,(req,res)=>{ res.json(db.prepare('SELECT id,email,name,role,created_at FROM users ORDER BY id DESC').all()); });
app.post('/api/admin/users',authRequired,adminOnly,async(req,res)=>{
 const {email,password,name,role}=req.body;
 const { hashPassword } = await import('./auth.js');
 if(!email||!password||!name) return res.status(400).json({error:'missing fields'});
 const hash=await hashPassword(password);
 try{ const r=db.prepare('INSERT INTO users(email,password_hash,name,role) VALUES(?,?,?,?)').run(email,hash,name,role||'user'); res.json({id:r.lastInsertRowid}); }catch(e){res.status(400).json({error:String(e.message)})}
});
app.delete('/api/admin/users/:id',authRequired,adminOnly,(req,res)=>{ db.prepare('DELETE FROM users WHERE id=?').run(req.params.id); res.json({ok:true}); });
function sha256(s){return crypto.createHash('sha256').update(s).digest('hex');}
app.get('/api/keys',authRequired,(req,res)=>{
 const isAdmin=req.user.role==='admin';
 const rows=isAdmin? db.prepare('SELECT api_keys.*, users.email as owner_email FROM api_keys JOIN users ON users.id=api_keys.user_id ORDER BY id DESC').all() : db.prepare('SELECT * FROM api_keys WHERE user_id=? ORDER BY id DESC').all(req.user.id);
 res.json(rows.map(r=>({...r,allowed_models:r.allowed_models?JSON.parse(r.allowed_models):[]} )));
});
app.post('/api/keys',authRequired,(req,res)=>{
 const {name,daily_limit,monthly_limit,allowed_models,user_id}=req.body||{};
 if(!name) return res.status(400).json({error:'name required'});
 const ownerId=(req.user.role==='admin'&&user_id)?user_id:req.user.id;
 const raw='codism_'+nanoid(32);
 const prefix=raw.slice(0,12)+'...';
 const hash=sha256(raw);
 const allowed=Array.isArray(allowed_models)?JSON.stringify(allowed_models):'[]';
 const r=db.prepare('INSERT INTO api_keys(user_id,name,prefix,key_hash,key_preview,daily_limit,monthly_limit,allowed_models) VALUES(?,?,?,?,?,?,?,?)').run(ownerId,name,prefix,hash,raw.slice(0,16)+'...',daily_limit||0,monthly_limit||0,allowed);
 res.json({id:r.lastInsertRowid,key:raw,prefix});
});
app.patch('/api/keys/:id',authRequired,(req,res)=>{
 const row=db.prepare('SELECT * FROM api_keys WHERE id=?').get(req.params.id);
 if(!row) return res.status(404).json({error:'not found'});
 if(req.user.role!=='admin'&&row.user_id!==req.user.id) return res.status(403).json({error:'forbidden'});
 const {is_active,daily_limit,monthly_limit,allowed_models,name}=req.body||{};
 db.prepare('UPDATE api_keys SET is_active=COALESCE(?,is_active),daily_limit=COALESCE(?,daily_limit),monthly_limit=COALESCE(?,monthly_limit),allowed_models=COALESCE(?,allowed_models),name=COALESCE(?,name) WHERE id=?').run(is_active!==undefined?(is_active?1:0):null,daily_limit??null,monthly_limit??null,allowed_models?JSON.stringify(allowed_models):null,name||null,req.params.id);
 res.json({ok:true});
});
app.delete('/api/keys/:id',authRequired,(req,res)=>{
 const row=db.prepare('SELECT * FROM api_keys WHERE id=?').get(req.params.id);
 if(!row) return res.status(404).json({error:'not found'});
 if(req.user.role!=='admin'&&row.user_id!==req.user.id) return res.status(403).json({error:'forbidden'});
 db.prepare('DELETE FROM api_keys WHERE id=?').run(req.params.id); res.json({ok:true});
});
app.get('/api/stats',authRequired,(req,res)=>{
 const isAdmin=req.user.role==='admin'; const uid=req.user.id;
 const whereKeyUser=isAdmin?'':'WHERE api_keys.user_id='+uid;
 const totalRequests=db.prepare('SELECT COUNT(*) as c FROM usage_logs '+(isAdmin?'':'WHERE user_id='+uid)).get().c;
 const todayRequests=db.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE date(created_at)=date('now') "+(isAdmin?'':'AND user_id='+uid)).get().c;
 const totalTokens=db.prepare('SELECT COALESCE(SUM(total_tokens),0) as s FROM usage_logs '+(isAdmin?'':'WHERE user_id='+uid)).get().s;
 const keysCount=db.prepare('SELECT COUNT(*) as c FROM api_keys '+whereKeyUser).get().c;
 const usersCount=isAdmin?db.prepare('SELECT COUNT(*) as c FROM users').get().c:1;
 const recent=db.prepare('SELECT usage_logs.*, api_keys.name as key_name FROM usage_logs LEFT JOIN api_keys ON api_keys.id=usage_logs.api_key_id '+(isAdmin?'':'WHERE usage_logs.user_id='+uid)+' ORDER BY usage_logs.id DESC LIMIT 50').all();
 const byModel=db.prepare('SELECT model, COUNT(*) as cnt, COALESCE(SUM(total_tokens),0) as tokens FROM usage_logs '+(isAdmin?'':'WHERE user_id='+uid)+' GROUP BY model ORDER BY cnt DESC LIMIT 10').all();
 const last7=db.prepare('SELECT date(created_at) as d, COUNT(*) as cnt FROM usage_logs '+(isAdmin?'':'WHERE user_id='+uid)+' GROUP BY d ORDER BY d DESC LIMIT 7').all().reverse();
 res.json({totalRequests,todayRequests,totalTokens,keysCount,usersCount,recent,byModel,last7});
});
app.use('/v1',async(req,res)=>{ await proxyToUpstream(req,res); });
}
