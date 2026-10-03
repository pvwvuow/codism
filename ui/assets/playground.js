(() => {
  "use strict";
  const API_BASE = (typeof window !== "undefined" && window.CODISM_API_BASE) || "";
  const _token = (typeof localStorage !== "undefined" && localStorage.getItem("codism_token")) || "";
  if (!_token) {
    location.replace("login.html");
    return;
  }
  const token = _token;

  const PLAN_FA = { none: "بدون پلن", starter: "استارتر", basic: "بیسیک", pro: "پرو", scale: "اسکیل" };
  const PLAN_QUOTA = { starter: 30000000, basic: 100000000, pro: 200000000, scale: 500000000 };
  const STATE = {
    me: null,
    cfg: null,
    chat: { messages: [], model: "grok-4.7", temp: 0.7, sys: "", streaming: false, ctrl: null },
    img: { busy: false },
    vid: { busy: false, poll: null }
  };

  var PG_DICT={
"پلی‌گراند — Codism":"Playground — Codism",
"پلی‌گراند":"Playground",
"پلی‌گراند قفل است":"Playground locked",
"برای استفاده از پلی‌گراند حداقل پلن استارتر لازم است.":"Starter plan or higher is required to use the playground.",
"اشتراک شما منقضی شده است — برای ادامه پلن را تمدید کنید.":"Your subscription has expired — renew your plan to continue.",
"اشتراک شما منقضی شده است.":"Your subscription has expired.",
"مشاهده پلن‌ها":"View plans",
"آپ‌استریم Grok هنوز تنظیم نشده است — به‌زودی فعال می‌شود.":"Grok upstream is not configured yet — coming soon.",
"آپ‌استریم Grok هنوز تنظیم نشده است.":"Grok upstream is not configured.",
"ساخت گفت‌وگو، تصویر و ویدیو با Grok — مستقیم از پنل":"Chat, image and video generation with Grok — directly from the dashboard",
"مصرف پلی‌گراند از سهمیه پلن شما کم می‌شود.":"Playground usage counts against your plan quota.",
"بخش‌های پلی‌گراند":"Playground sections",
"گفت‌وگو":"Chat",
"تصویر ساز":"Image",
"ویدیو ساز":"Video",
"مدل":"Model",
"خلاقیت":"Creativity",
"گفت‌وگوی جدید":"New chat",
"گفت‌وگوی جدید؟":"New conversation?",
"دستور سیستم (اختیاری)":"System prompt (optional)",
"رفتار دستیار را اینجا تعریف کنید…":"Define assistant behavior here…",
"یک شعر کوتاه درباره باران بنویس":"Write a short poem about rain",
"تاریخ ایران را در ۳ پاراگراف خلاصه کن":"Summarize the history of Iran in 3 paragraphs",
"یک برنامه کوتاه جاوااسکریپت بنویس که لیست را مرتب کند":"Write a short JavaScript snippet that sorts a list",
"بهتر بودن سرویس Codism را در یک پیام توضیح بده":"Explain in one message why Codism is better",
"پیام خود را بنویسید… (Enter برای ارسال، Shift+Enter خط جدید)":"Type your message… (Enter to send, Shift+Enter for new line)",
"ارسال":"Send",
"توقف":"Stop",
"متوقف شد":"Stopped",
"توصیف تصویر":"Image prompt",
"توصیف تصویر موردنظر…":"Describe the image you want…",
"تعداد":"Count",
"نسبت":"Aspect ratio",
"رزولوشن":"Resolution",
"ساخت تصویر":"Generate image",
"توصیف ویدیو":"Video prompt",
"توصیف ویدیو موردنظر…":"Describe the video you want…",
"مدت":"Duration",
"۸ ثانیه":"8s",
"ثانیه":"s",
"توکن":"tokens",
"ساخت ویدیو":"Generate video",
"در حال ساخت…":"Generating…",
"آماده شد":"Ready",
"دانلود":"Download",
"دانلود ویدیو":"Download video",
"هزینه:":"Cost:",
"سهمیه این ماه:":"Monthly quota:",
"سهمیه: نامحدود":"Quota: unlimited",
"پلن":"Plan",
"ادمین":"Admin",
"بدون پلن":"No plan",
"استارتر":"Starter",
"بیسیک":"Basic",
"پرو":"Pro",
"اسکیل":"Scale",
"پلن فعلی:":"Current plan:",
"پلن استارتر":"Starter plan",
"مدل‌ها":"Models",
"تعرفه‌ها":"Pricing",
"مستندات":"Docs",
"تغییرات":"Changelog",
"ایونت":"Event",
"وضعیت":"Status",
"ورود":"Sign in",
"شروع کن":"Get started",
"منو":"Menu",
"نشست منقضی شد":"Session expired",
"خطای غیرمنتظره":"Unexpected error",
"خطا در اتصال — دوباره تلاش کنید":"Connection error — try again",
"خطا در بارگذاری":"Load error",
"این مدل در دسترس نیست.":"This model is not available.",
"تعداد درخواست‌ها زیاد است — کمی صبر کنید.":"Too many requests — please wait a moment.",
"سهمیه ماهانه تمام شد.":"Monthly quota exceeded.",
"سهمیه روزانه تمام شد.":"Daily quota exceeded.",
"پیام نامعتبر است.":"Invalid message.",
"مجموع پیام‌ها طولانی است.":"Messages are too long.",
"سرویس موقتا در دسترس نیست.":"Service temporarily unavailable.",
"پاسخ سرویس طولانی شد.":"Service response timed out."
};
  try { if (window.I18N && typeof PG_DICT === "object") window.I18N.addDict(PG_DICT); } catch (e) {}

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function faNum(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    var lang = (window.I18N && window.I18N.lang) || "fa";
    try {
      return v.toLocaleString(lang === "en" ? "en-US" : "fa-IR");
    } catch (e2) {
      return String(v);
    }
  }
  function TR(fa, en) {
    var lang = (window.I18N && window.I18N.lang) || "fa";
    return lang === "en" ? en : fa;
  }
  function $(id) { return document.getElementById(id); }
  function fmtTok(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    if (v >= 1000000000) return (v / 1000000000).toFixed(1).replace(/\.0$/, "") + "B";
    if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(v);
  }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function saveChat() {
    try {
      var data = {
        messages: STATE.chat.messages.slice(0, 200),
        model: STATE.chat.model,
        temp: STATE.chat.temp,
        sys: STATE.chat.sys
      };
      localStorage.setItem("codism_pg_chat", JSON.stringify(data));
    } catch (e3) {}
  }
  function loadChat() {
    try {
      var raw = localStorage.getItem("codism_pg_chat");
      if (!raw) return;
      var j = JSON.parse(raw);
      if (!j || typeof j !== "object") return;
      if (Array.isArray(j.messages)) {
        var arr = j.messages.filter(function (m) {
          return m && typeof m === "object" && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string";
        }).slice(0, 200);
        STATE.chat.messages = arr;
      }
      if (typeof j.model === "string" && j.model) STATE.chat.model = j.model;
      if (typeof j.temp === "number" && isFinite(j.temp)) STATE.chat.temp = j.temp;
      if (typeof j.sys === "string") STATE.chat.sys = j.sys;
    } catch (e4) {}
  }

  function authHeaders() {
    return { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  }
  async function api(path, opts) {
    var o = opts || {};
    var headers = authHeaders();
    if (o.headers) Object.assign(headers, o.headers);
    var res = await fetch(API_BASE + path, Object.assign({}, o, { headers: headers }));
    if (res.status === 401) {
      try { localStorage.removeItem("codism_token"); } catch (e5) {}
      location.replace("login.html");
      var e401 = new Error(TR("نشست منقضی شد", "Session expired"));
      e401.status = 401;
      e401.code = "unauthorized";
      throw e401;
    }
    if (!res.ok) {
      var body = {};
      try { body = await res.json(); } catch (e6) { body = {}; }
      var code = (body && body.error && body.error.code) || "";
      var message = (body && body.error && body.error.message) || TR("خطای غیرمنتظره", "Unexpected error");
      var err = new Error(message);
      err.code = code;
      err.message = message;
      err.status = res.status;
      err.body = body;
      if (code && typeof window !== "undefined" && window.I18N && window.I18N.lang === "en" && window.I18N.codeMap && window.I18N.codeMap[code]) err.message = window.I18N.codeMap[code];
      throw err;
    }
    var ct = res.headers.get("content-type") || "";
    if (ct.indexOf("application/json") !== -1) return res.json();
    var txt = await res.text();
    try { return JSON.parse(txt); } catch (e7) { return txt; }
  }

  var _emptyTemplate = "";
  function captureEmptyTemplate() {
    var msgs = $("pg-msgs");
    if (!msgs) return;
    var empty = q(".pg-empty", msgs);
    if (empty) _emptyTemplate = empty.outerHTML;
    else _emptyTemplate = msgs.innerHTML;
  }
  function getEmptyTemplate() { return _emptyTemplate; }

  function setChatErr(msg) {
    var el = $("pg-chat-err");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  function renderLock(cfg) {
    var lock = $("pg-lock");
    if (lock) lock.classList.remove("hidden");
    var app = $("pg-app");
    if (app) {
      app.classList.add("hidden");
    } else {
      var h = $("pg-head");
      if (h) h.classList.add("hidden");
      var tabs = $("pg-tabs");
      if (tabs) tabs.classList.add("hidden");
      ["pg-panel-chat", "pg-panel-image", "pg-panel-video"].forEach(function (id) {
        var el = $(id);
        if (el) el.classList.add("hidden");
      });
      qa(".pg-panel").forEach(function (el) { el.classList.add("hidden"); });
    }
    var reason = cfg && cfg.reason;
    var msgEl = $("pg-lock-msg");
    if (msgEl) {
      if (reason === "subscription_expired") msgEl.textContent = "اشتراک شما منقضی شده است \u2014 برای ادامه پلن را تمدید کنید.";
      else msgEl.textContent = "برای استفاده از پلی\u200cگراند حداقل پلن استارتر لازم است.";
    }
    var plan = (cfg && cfg.plan) || (STATE.me && STATE.me.user && STATE.me.user.plan) || null;
    var planEl = $("pg-lock-plan");
    if (planEl) {
      var fa = PLAN_FA[plan] || PLAN_FA.none;
      planEl.textContent = "پلن فعلی: " + fa;
    }
  }

  function fillSelectFromList(id, list) {
    var el = $(id);
    if (!el || !Array.isArray(list) || !list.length) return;
    var cur = el.value;
    el.innerHTML = "";
    list.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(v);
      el.appendChild(opt);
    });
    if (cur && list.indexOf(cur) !== -1) el.value = cur;
  }

  function fillModels(cfg) {
    var sel = $("pg-model");
    if (!sel || !cfg) return;
    var list = cfg.chat_models;
    if (!Array.isArray(list) || !list.length) return;
    var cur = STATE.chat.model || sel.value;
    sel.innerHTML = "";
    list.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = String(m);
      opt.textContent = String(m);
      sel.appendChild(opt);
    });
    if (list.indexOf(cur) !== -1) sel.value = cur;
    else {
      sel.value = list[0];
      STATE.chat.model = list[0];
    }
  }

  function fillImageVideoSelects(cfg) {
    if (!cfg) return;
    if (cfg.image) {
      fillSelectFromList("pg-img-ar", cfg.image.aspect_ratios);
      fillSelectFromList("pg-img-res", cfg.image.resolutions);
    }
    var imgGo = $("pg-img-go");
    if (imgGo) imgGo.disabled = !cfg.image;
    if (cfg.video) {
      fillSelectFromList("pg-vid-ar", cfg.video.aspect_ratios);
      fillSelectFromList("pg-vid-res", cfg.video.resolutions);
    }
  }

  function renderHeaderChips() {
    var me = STATE.me;
    var cfg = STATE.cfg;
    var plan = (cfg && cfg.plan) || (me && me.user && me.user.plan) || null;
    var role = me && me.user && me.user.role;
    var planChip = $("pg-plan-chip");
    if (planChip) {
      if (role === "admin") {
        planChip.textContent = "ادمین";
        planChip.hidden = false;
      } else if (plan && PLAN_FA[plan]) {
        planChip.textContent = "پلن " + PLAN_FA[plan];
        planChip.hidden = false;
      } else {
        planChip.textContent = PLAN_FA.none;
        planChip.hidden = false;
      }
    }
    var quotaChip = $("pg-quota-chip");
    if (!quotaChip) return;
    var quota = plan ? PLAN_QUOTA[plan] : null;
    if (role === "admin" && !quota) {
      quotaChip.textContent = TR("سهمیه: نامحدود", "Quota: unlimited");
      quotaChip.hidden = false;
      return;
    }
    if (quota) {
      var month = me && me.month;
      var used = 0;
      if (month) {
        var pt = Number(month.prompt_tokens) || 0;
        var ct = Number(month.completion_tokens) || 0;
        if (month.quota_tokens != null) used = Number(month.quota_tokens) || (pt + ct);
        else used = pt + ct;
      }
      quotaChip.textContent = TR("سهمیه این ماه: " + faNum(used) + " از " + fmtTok(quota), "This month: " + faNum(used) + " of " + fmtTok(quota));
      quotaChip.hidden = false;
    } else if (role === "admin") {
      quotaChip.textContent = TR("سهمیه: نامحدود", "Quota: unlimited");
      quotaChip.hidden = false;
    } else {
      quotaChip.hidden = true;
    }
  }

  function renderMessages() {
    var msgs = $("pg-msgs");
    if (!msgs) return;
    var list = STATE.chat.messages;
    if (!list || !list.length) {
      if (_emptyTemplate) msgs.innerHTML = _emptyTemplate;
      else msgs.innerHTML = '<div class="pg-empty"></div>';
      bindSampleChips();
      return;
    }
    msgs.innerHTML = "";
    list.forEach(function (m) {
      var div = document.createElement("div");
      var isUser = m.role === "user";
      div.className = "pg-msg " + (isUser ? "user" : "assistant");
      var inner = document.createElement("div");
      inner.className = "notrans";
      inner.style.whiteSpace = "pre-wrap";
      inner.style.wordBreak = "break-word";
      inner.textContent = m.content;
      div.appendChild(inner);
      msgs.appendChild(div);
    });
  }

  function bindSampleChips() {
    qa("[data-fill]", $("pg-msgs")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-fill") || "";
        var inp = $("pg-input");
        if (inp) {
          inp.value = v;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.focus();
        }
      });
    });
  }

  function wireTabs() {
    var tabs = $("pg-tabs");
    if (!tabs) return;
    var btns = qa("[data-tab]", tabs);
    var panels = {
      chat: $("pg-panel-chat"),
      image: $("pg-panel-image"),
      video: $("pg-panel-video")
    };
    function activate(name) {
      btns.forEach(function (b) {
        var t = b.getAttribute("data-tab");
        var on = t === name;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      Object.keys(panels).forEach(function (k) {
        var p = panels[k];
        if (!p) return;
        if (k === name) p.hidden = false;
        else p.hidden = true;
      });
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-tab");
        if (t) activate(t);
      });
    });
    activate("chat");
  }

  function wireComposerDisabledPlaceholder() {
    var inp = $("pg-input");
    var send = $("pg-send");
    var ch = $("pg-char");
    var temp = $("pg-temp");
    var tempVal = $("pg-temp-val");
    var modelSel = $("pg-model");
    var sysEl = $("pg-system");
    var newChatBtn = $("pg-new-chat");

    function updateChar() {
      if (!inp || !ch) return;
      var len = inp.value.length;
      ch.textContent = faNum(len) + " / " + faNum(16000);
    }
    if (inp) {
      inp.addEventListener("input", function () {
        updateChar();
        inp.style.height = "auto";
        inp.style.height = Math.min(inp.scrollHeight, 160) + "px";
      });
      updateChar();
    }
    if (temp && tempVal) {
      var syncTemp = function () {
        var v = parseFloat(temp.value);
        if (!isFinite(v)) v = 0.7;
        STATE.chat.temp = v;
        tempVal.textContent = faNum(v.toFixed(1).replace(".0", ".0"));
        saveChat();
      };
      temp.addEventListener("input", syncTemp);
      syncTemp();
    }
    if (modelSel) {
      modelSel.addEventListener("change", function () {
        STATE.chat.model = modelSel.value;
        saveChat();
      });
    }
    if (sysEl) {
      sysEl.value = STATE.chat.sys || "";
      sysEl.addEventListener("input", function () {
        STATE.chat.sys = sysEl.value;
        saveChat();
      });
    }
  }

  async function boot() {
    captureEmptyTemplate();
    wireTabs();

    var me = null;
    var cfg = null;
    try {
      var results = await Promise.all([api("/api/me"), api("/api/playground/config")]);
      me = results[0];
      cfg = results[1];
    } catch (err) {
      if (err && err.status === 401) return;
      var isNet = !err || !err.status || err.status === 0;
      if (isNet) {
        setChatErr(TR("خطا در اتصال — دوباره تلاش کنید", "Connection error — try again"));
      } else {
        var m = (err && err.message) || TR("خطا در بارگذاری", "Load error");
        setChatErr(m);
      }
      return;
    }

    STATE.me = me;
    STATE.cfg = cfg;

    if (!cfg || cfg.allowed !== true) {
      renderLock(cfg || {});
      return;
    }

    var nokey = $("pg-nokey");
    if (nokey) nokey.hidden = cfg.grok_configured === true;

    fillModels(cfg);
    fillImageVideoSelects(cfg);
    renderHeaderChips();

    loadChat();
    if (STATE.chat.messages.length > 200) STATE.chat.messages = STATE.chat.messages.slice(-200);
    var sysEl2 = $("pg-system");
    if (sysEl2) sysEl2.value = STATE.chat.sys || "";
    var tempEl = $("pg-temp");
    if (tempEl) {
      var tv = Number(STATE.chat.temp);
      if (isFinite(tv)) tempEl.value = String(tv);
      var tvDisp = $("pg-temp-val");
      if (tvDisp) tvDisp.textContent = faNum(Number(tempEl.value).toFixed(1));
    }
    var modelEl = $("pg-model");
    if (modelEl && STATE.chat.model) {
      var opts = Array.prototype.slice.call(modelEl.options).map(function (o) { return o.value; });
      if (opts.indexOf(STATE.chat.model) !== -1) modelEl.value = STATE.chat.model;
    }

    renderMessages();
    wireComposerDisabledPlaceholder();
    bindSampleChips();

    try {
      if (window.I18N && window.I18N.lang === "en" && typeof window.I18N.sweep === "function") window.I18N.sweep(document);
    } catch (e8) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { boot(); });
  } else {
    boot();
  }
/* chat rendering */
var EMPTY_HTML="";
var _pgEmptyDone=false;
function _captureEmpty(){
  if(_pgEmptyDone) return;
  var b=$("pg-msgs");
  if(b) EMPTY_HTML=b.innerHTML;
  _pgEmptyDone=true;
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", _captureEmpty, {once:true});
}else{
  _captureEmpty();
}
function _isNearBottom(){
  try{
    return (window.innerHeight+window.scrollY) >= (document.documentElement.scrollHeight-80);
  }catch(e){ return true; }
}
function _pinIfNeeded(was){
  if(!was) return;
  try{ window.scrollTo(0, document.documentElement.scrollHeight); }catch(e){}
}
function _assistantHtml(src, streaming){
  var s=esc(src==null?"":String(src));
  var fences=[];
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code){
    var idx=fences.length;
    fences.push('<pre class="notrans" dir="ltr"><code>'+code+'</code></pre>');
    return "\u0000F"+idx+"\u0000";
  });
  var segs=s.split(/\u0000F(\d+)\u0000/g);
  var out="";
  for(var i=0;i<segs.length;i++){
    if(i%2===1){
      var idx=parseInt(segs[i],10);
      if(!isNaN(idx) && fences[idx]) out+=fences[idx];
    }else{
      var t=segs[i];
      t=t.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
      t=t.replace(/\*\*([^\*]+?)\*\*/g, "<strong>$1</strong>");
      t=t.replace(/\n/g, "<br>");
      out+=t;
    }
  }
  if(streaming) out+='<span class="pg-cursor">\u258D</span>';
  return out;
}
function renderMsg(m){
  var was=_isNearBottom();
  var box=$("pg-msgs");
  if(!box) return null;
  if(!_pgEmptyDone) _captureEmpty();
  if(box.querySelector&&box.querySelector(".pg-empty")&&STATE.chat.messages.length>0){
    var emp=box.querySelector(".pg-empty");
    if(emp) emp.remove();
    if(box.innerHTML.trim()===EMPTY_HTML.trim()) box.innerHTML="";
  }
  var div=document.createElement("div");
  var isUser=m&&m.role==="user";
  div.className="pg-msg "+(isUser?"pg-msg-user user":"pg-msg-assistant assistant");
  if(isUser){
    div.dir="auto";
    div.innerHTML=esc(m.content||"").replace(/\n/g,"<br>");
  }else{
    div.innerHTML=_assistantHtml(m.content||"", !!m.streaming);
  }
  box.appendChild(div);
  _pinIfNeeded(was);
  return div;
}
function renderAll(){
  var box=$("pg-msgs");
  if(!box) return;
  if(!_pgEmptyDone) _captureEmpty();
  var was=_isNearBottom();
  box.innerHTML="";
  var msgs=STATE.chat.messages||[];
  if(msgs.length===0){
    box.innerHTML=EMPTY_HTML;
    return;
  }
  for(var i=0;i<msgs.length;i++){
    var mm=msgs[i];
    var d=document.createElement("div");
    var u=mm&&mm.role==="user";
    d.className="pg-msg "+(u?"pg-msg-user user":"pg-msg-assistant assistant");
    if(u){
      d.dir="auto";
      d.innerHTML=esc(mm.content||"").replace(/\n/g,"<br>");
    }else{
      d.innerHTML=_assistantHtml(mm.content||"", !!mm.streaming);
    }
    box.appendChild(d);
  }
  _pinIfNeeded(was);
}

function clearChatErr(){hideChatErr();}

function renderErrorBubble(msg){
  var was=_isNearBottom();
  var box=$("pg-msgs");
  if(box){
    if(!_pgEmptyDone) _captureEmpty();
    var d=document.createElement("div");
    d.className="pg-msg pg-msg-assistant assistant";
    d.innerHTML='<div class="pg-err">'+esc(msg||TR("خطای غیرمنتظره","Unexpected error"))+'</div>';
    box.appendChild(d);
    _pinIfNeeded(was);
  }
  showChatErr(msg);
}
function bumpQuotaChip(delta){
  try{
    var chip=$("pg-quota-chip");
    if(!chip) return;
    var plan=(STATE.me&&STATE.me.plan)||(STATE.cfg&&STATE.cfg.plan)||"starter";
    var quota=PLAN_QUOTA[plan]||PLAN_QUOTA.starter;
    STATE._optimisticTokens=(STATE._optimisticTokens||0)+(Number(delta)||0);
    var baseUsed=0;
    if(STATE.me&&typeof STATE.me.month_quota_tokens==="number") baseUsed=STATE.me.month_quota_tokens;
    else if(STATE._monthUsed!=null) baseUsed=STATE._monthUsed;
    else if(STATE.me&&STATE.me.month&&typeof STATE.me.month.quota_tokens==="number") baseUsed=STATE.me.month.quota_tokens;
    var used=baseUsed+STATE._optimisticTokens;
    if(used<0) used=0;
    var faUsed=typeof faNum==="function"?faNum(used):String(used);
    var fmtQuota=typeof fmtTok==="function"?fmtTok(quota):String(quota);
    chip.textContent=TR("سهمیه این ماه: "+faUsed+" از "+fmtQuota, "Monthly quota: "+used+" / "+quota);
  }catch(e){}
}
const ERR_FA={no_active_plan:"برای استفاده از پلی‌گراند حداقل پلن استارتر لازم است.",subscription_expired:"اشتراک شما منقضی شده است.",grok_not_configured:"آپ‌استریم Grok هنوز تنظیم نشده است.",model_not_allowed:"این مدل در دسترس نیست.",rpm_exceeded:"تعداد درخواست‌ها زیاد است — کمی صبر کنید.",monthly_quota_exceeded:"سهمیه ماهانه تمام شد.",daily_quota_exceeded:"سهمیه روزانه تمام شد.",invalid_messages:"پیام نامعتبر است.",messages_too_long:"مجموع پیام‌ها طولانی است.",upstream_error:"سرویس موقتا در دسترس نیست.",upstream_timeout:"پاسخ سرویس طولانی شد.",upstream_challenge:"سرویس موقتا در دسترس نیست."};
function hideChatErr(){var e=$("pg-chat-err");if(e){e.hidden=true;e.textContent="";}}
function save(){try{saveChat()}catch(_){}}
function scrollPin(){try{_pinIfNeeded()}catch(_){}}
function escapeAndMarkdown(s){return _assistantHtml(s)}
function bumpQuota(pt,ct){try{bumpQuotaChip(pt,ct)}catch(_){}}
function showChatErr(codeOrMsg){var friendly=(codeOrMsg&&ERR_FA[codeOrMsg])?ERR_FA[codeOrMsg]:(codeOrMsg||ERR_FA.upstream_error);try{if(typeof errBubble==="function") errBubble(codeOrMsg);}catch(_){var me=$("pg-msgs");if(me){var eb=document.createElement("div");eb.className="pg-msg assistant pg-err";eb.style.borderColor="#FECACA";eb.style.background="#FEF2F2";eb.style.color="#B91C1C";eb.textContent=TR(friendly,codeOrMsg||"Error");me.appendChild(eb);}}var el=$("pg-chat-err");if(el){el.textContent=TR(friendly,codeOrMsg||"Error");el.hidden=false;}}
function autoGrow(){var el=$("pg-input");if(!el) return;el.style.height="auto";var h=Math.min(el.scrollHeight,180);el.style.height=h+"px";}
function updateCounter(){var el=$("pg-input");var cc=$("pg-char");if(!el||!cc) return;var len=el.value.length;if(len>16000){el.value=el.value.slice(0,16000);len=16000;}cc.textContent=faNum(len)+" / "+faNum(16000);cc.style.color=len>=16000?"#B91C1C":"var(--ink-400)";}
function updateSendBtn(){var btn=$("pg-send");var inp=$("pg-input");if(!btn) return;if(STATE.chat.streaming){btn.textContent=TR("توقف","Stop");btn.disabled=false;btn.setAttribute("aria-label",TR("توقف","Stop"));}else{btn.textContent=TR("ارسال","Send");var empty=!inp||!inp.value.trim();btn.disabled=empty;btn.removeAttribute("aria-label");}}
async function send(text){
  if(STATE.chat.streaming) return;
  var t=(text||"").trim();
  if(!t) return;
  hideChatErr();
  STATE.chat.messages.push({role:"user",content:t});
  try{renderMsg({role:"user",content:t});}catch(_){var me=$("pg-msgs");if(me){var d=document.createElement("div");d.className="pg-msg user";d.textContent=t;me.appendChild(d);}}
  try{save();}catch(_){}
  try{scrollPin();}catch(_){}
  STATE.chat.streaming=true;
  STATE.chat.ctrl=new AbortController();
  updateSendBtn();
  var msgsEl=$("pg-msgs");
  if(msgsEl){
    var emptyEl=msgsEl.querySelector(".pg-empty");
    if(emptyEl) emptyEl.remove();
  }
  var full="";
  var usage=null;
  var startTs=Date.now();
  var bubble=document.createElement("div");
  bubble.className="pg-msg assistant";
  bubble.setAttribute("data-streaming","1");
  var contentEl=document.createElement("div");
  contentEl.className="notrans";
  contentEl.style.whiteSpace="pre-wrap";
  contentEl.style.wordBreak="break-word";
  contentEl.style.textAlign="left";
  contentEl.dir="auto";
  var cursor=document.createElement("span");
  cursor.textContent="▌";
  cursor.style.opacity=".6";
  cursor.style.marginInlineStart="2px";
  var footerEl=document.createElement("div");
  footerEl.style.fontSize=".75rem";
  footerEl.style.color="var(--ink-400)";
  footerEl.style.marginTop=".35rem";
  bubble.appendChild(contentEl);
  bubble.appendChild(cursor);
  bubble.appendChild(footerEl);
  if(msgsEl) msgsEl.appendChild(bubble);
  try{scrollPin();}catch(_){}
  var token=localStorage.getItem("codism_token");
  var headers={"Content-Type":"application/json"};
  if(token) headers["Authorization"]="Bearer "+token;
  var bodyMessages=[];
  if(STATE.chat.sys&&STATE.chat.sys.trim()) bodyMessages.push({role:"system",content:STATE.chat.sys.trim()});
  for(var i=0;i<STATE.chat.messages.length;i++){var m=STATE.chat.messages[i];bodyMessages.push({role:m.role,content:m.content});}
  var payload={model:STATE.chat.model,messages:bodyMessages,temperature:Number(STATE.chat.temp)};
  var res;
  try{
    res=await fetch((typeof API_BASE!=="undefined"&&API_BASE?API_BASE:(window.CODISM_API_BASE||""))+"/api/playground/chat",{method:"POST",headers:headers,body:JSON.stringify(payload),signal:STATE.chat.ctrl.signal});
  }catch(fe){
    if(fe&&fe.name==="AbortError"){
      try{cursor.remove();}catch(_){}
      footerEl.textContent=TR("متوقف شد","Stopped")+" · "+STATE.chat.model;
      if(full){
        try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}
        STATE.chat.messages.push({role:"assistant",content:full});
        if(STATE.chat.messages.length>200) STATE.chat.messages.splice(0,STATE.chat.messages.length-200);
        try{save();}catch(_){}
      }else{bubble.remove();}
      STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();try{scrollPin();}catch(_){}
      return;
    }
    showChatErr("upstream_error");
    if(!full) bubble.remove(); else {try{cursor.remove();}catch(_){}}
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();
    return;
  }
  if(!res.ok){
    var code="";
    try{var j=await res.json();code=(j&&j.error&&j.error.code)||"";}catch(_){}
    showChatErr(code||"upstream_error");
    bubble.remove();
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();
    return;
  }
  var reader=res.body&&res.body.getReader?res.body.getReader():null;
  if(!reader){
    showChatErr("upstream_error");
    bubble.remove();
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();
    return;
  }
  var decoder=new TextDecoder();
  var buf="";
  function finalizeDone(){
    try{cursor.remove();}catch(_){}
    var elapsed=((Date.now()-startTs)/1000).toFixed(1);
    var elapsedFa=faNum(parseFloat(elapsed)).replace(".","٫");
    var tokLine="";
    if(usage&&((usage.prompt_tokens!=null)||(usage.completion_tokens!=null))){
      var pt=usage.prompt_tokens||0;
      var ct=usage.completion_tokens||0;
      tokLine=" · "+faNum(pt+ct)+" "+TR("توکن","tokens");
      try{bumpQuota(pt,ct);}catch(_){}
    }
    footerEl.textContent=STATE.chat.model+" · "+elapsedFa+" "+TR("ثانیه","s")+tokLine;
    if(full){try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}}
    STATE.chat.messages.push({role:"assistant",content:full});
    if(STATE.chat.messages.length>200) STATE.chat.messages.splice(0,STATE.chat.messages.length-200);
    try{save();}catch(_){}
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();try{scrollPin();}catch(_){}
  }
  function finalizeAborted(){
    try{cursor.remove();}catch(_){}
    footerEl.textContent=TR("متوقف شد","Stopped")+" · "+STATE.chat.model;
    if(full){
      try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}
      STATE.chat.messages.push({role:"assistant",content:full});
      if(STATE.chat.messages.length>200) STATE.chat.messages.splice(0,STATE.chat.messages.length-200);
      try{save();}catch(_){}
    }else{bubble.remove();}
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();try{scrollPin();}catch(_){}
  }
  try{
    while(true){
      var r=await reader.read();
      if(r.done) break;
      buf+=decoder.decode(r.value,{stream:true});
      var lines=buf.split("\n");
      buf=lines.pop()||"";
      for(var li=0;li<lines.length;li++){
        var line=lines[li].trim();
        if(!line) continue;
        if(line.indexOf("data:")!==0) continue;
        var data=line.slice(5).trim();
        if(data==="[DONE]"){finalizeDone();return;}
        var o;
        try{o=JSON.parse(data);}catch(_){continue;}
        if(o.usage) usage=o.usage;
        if(o.error&&o.error.code){showChatErr(o.error.code);}
        var delta=o.choices&&o.choices[0]&&o.choices[0].delta&&o.choices[0].delta.content;
        if(typeof delta==="string"&&delta){
          full+=delta;
          try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}
          try{scrollPin();}catch(_){}
        }
      }
    }
    var tail=buf.trim();
    if(tail.indexOf("data:")===0){
      var d2=tail.slice(5).trim();
      if(d2&&d2!=="[DONE]"){
        try{
          var o2=JSON.parse(d2);
          if(o2.usage) usage=o2.usage;
          var delta2=o2.choices&&o2.choices[0]&&o2.choices[0].delta&&o2.choices[0].delta.content;
          if(typeof delta2==="string"&&delta2){full+=delta2;try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}}
        }catch(_){}
      }
    }
    finalizeDone();
  }catch(e){
    if(e&&e.name==="AbortError"){finalizeAborted();return;}
    showChatErr("upstream_error");
    if(full){
      try{cursor.remove();}catch(_){}
      footerEl.textContent=STATE.chat.model;
      try{contentEl.innerHTML=escapeAndMarkdown(full);}catch(_){contentEl.textContent=full;}
      STATE.chat.messages.push({role:"assistant",content:full});
      if(STATE.chat.messages.length>200) STATE.chat.messages.splice(0,STATE.chat.messages.length-200);
      try{save();}catch(_){}
    }else{bubble.remove();}
    STATE.chat.streaming=false;STATE.chat.ctrl=null;updateSendBtn();
  }
}
(function(){
  var inp=$("pg-input");
  var btn=$("pg-send");
  var tempEl=$("pg-temp");
  var tempVal=$("pg-temp-val");
  var modelEl=$("pg-model");
  var sysEl=$("pg-system");
  var newBtn=$("pg-new-chat");
  var msgsEl=$("pg-msgs");
  if(tempVal){
    try{tempVal.textContent=faNum(Number(STATE.chat.temp)).replace(".","٫");}catch(_){tempVal.textContent=String(STATE.chat.temp).replace(".","٫");}
  }
  if(tempEl){
    tempEl.addEventListener("input",function(e){
      var v=parseFloat(e.target.value);
      STATE.chat.temp=v;
      if(tempVal){try{tempVal.textContent=faNum(v).replace(".","٫");}catch(_){tempVal.textContent=String(v).replace(".","٫");}}
      try{save();}catch(_){}
    });
  }
  if(modelEl){
    try{modelEl.value=STATE.chat.model;}catch(_){}
    modelEl.addEventListener("change",function(e){STATE.chat.model=e.target.value;try{save();}catch(_){}});
  }
  if(sysEl){
    try{sysEl.value=STATE.chat.sys||"";}catch(_){}
    sysEl.addEventListener("input",function(e){STATE.chat.sys=e.target.value;try{save();}catch(_){}});
  }
  var isComposing=false;
  if(inp){
    inp.addEventListener("compositionstart",function(){isComposing=true;});
    inp.addEventListener("compositionend",function(){isComposing=false;});
    inp.addEventListener("input",function(){
      if(inp.value.length>16000) inp.value=inp.value.slice(0,16000);
      autoGrow();
      updateCounter();
      updateSendBtn();
    });
    inp.addEventListener("keydown",function(e){
      if(e.key==="Enter"&&!e.shiftKey&&!isComposing){
        e.preventDefault();
        var val=inp.value.trim();
        if(!val||STATE.chat.streaming) return;
        var toSend=inp.value;
        inp.value="";
        autoGrow();
        updateCounter();
        updateSendBtn();
        send(toSend);
      }
    });
  }
  if(btn){
    btn.addEventListener("click",function(){
      if(STATE.chat.streaming){
        if(STATE.chat.ctrl) try{STATE.chat.ctrl.abort();}catch(_){}
        return;
      }
      var val=inp?inp.value:"";
      if(!val.trim()) return;
      var toSend=val;
      if(inp){inp.value="";autoGrow();updateCounter();updateSendBtn();}
      send(toSend);
    });
  }
  if(msgsEl){
    msgsEl.addEventListener("click",function(e){
      var chip=e.target.closest&&e.target.closest(".pg-chip[data-fill]");
      if(!chip) return;
      var txt=chip.getAttribute("data-fill")||"";
      if(!inp) return;
      inp.value=txt;
      inp.focus();
      autoGrow();
      updateCounter();
      updateSendBtn();
    });
  }
  if(newBtn){
    newBtn.addEventListener("click",function(){
      if(STATE.chat.streaming&&STATE.chat.ctrl) try{STATE.chat.ctrl.abort();}catch(_){}
      if(STATE.chat.messages.length>0){
        if(!confirm(TR("گفت‌وگوی جدید؟","New conversation?"))) return;
      }
      STATE.chat.messages=[];
      try{localStorage.removeItem("codism_pg_chat");}catch(_){}
      try{save();}catch(_){}
      if(msgsEl){
        try{msgsEl.innerHTML=EMPTY_HTML;}catch(_){msgsEl.innerHTML='<div class="pg-empty"><button type="button" class="pg-chip" data-fill="یک شعر کوتاه درباره باران بنویس">یک شعر کوتاه درباره باران بنویس</button><button type="button" class="pg-chip" data-fill="تاریخ ایران را در ۳ پاراگراف خلاصه کن">تاریخ ایران را در ۳ پاراگراف خلاصه کن</button><button type="button" class="pg-chip" data-fill="یک برنامه کوتاه جاوااسکریپت بنویس که لیست را مرتب کند">یک برنامه کوتاه جاوااسکریپت بنویس که لیست را مرتب کند</button></div>';}
      }
      hideChatErr();
      if(inp){inp.value="";autoGrow();updateCounter();}
      if(STATE.chat.streaming){STATE.chat.streaming=false;STATE.chat.ctrl=null;}
      updateSendBtn();
      try{scrollPin();}catch(_){}
    });
  }
  autoGrow();
  updateCounter();
  updateSendBtn();
})();
/* __PG_PART2_IMAGE_VIDEO__ */
var IMG_ERR_FA={
  grok_not_configured:"آپ‌استریم Grok هنوز تنظیم نشده است.",
  rpm_exceeded:"تعداد درخواست‌ها زیاد است — کمی صبر کنید.",
  monthly_quota_exceeded:"سهمیه ماهانه تمام شد.",
  daily_quota_exceeded:"سهمیه روزانه تمام شد.",
  invalid_prompt:"توصیف تصویر نامعتبر است.",
  invalid_n:"تعداد تصویر نامعتبر است.",
  invalid_aspect_ratio:"نسبت تصویر نامعتبر است.",
  invalid_resolution:"رزولوشن نامعتبر است.",
  invalid_duration:"مدت ویدیو نامعتبر است.",
  media_upstream_error:"ساخت تصویر موقتا در دسترس نیست.",
  media_failed:"ساخت تصویر موقتا در دسترس نیست.",
  upstream_error:"ساخت تصویر موقتا در دسترس نیست.",
  upstream_timeout:"ساخت تصویر موقتا در دسترس نیست.",
  no_active_plan:"برای استفاده از پلی‌گراند حداقل پلن استارتر لازم است.",
  subscription_expired:"اشتراک شما منقضی شده است."
};
var VID_ERR_FA={
  grok_not_configured:"آپ‌استریم Grok هنوز تنظیم نشده است.",
  rpm_exceeded:"تعداد درخواست‌ها زیاد است — کمی صبر کنید.",
  monthly_quota_exceeded:"سهمیه ماهانه تمام شد.",
  daily_quota_exceeded:"سهمیه روزانه تمام شد.",
  invalid_prompt:"توصیف ویدیو نامعتبر است.",
  invalid_aspect_ratio:"نسبت ویدیو نامعتبر است.",
  invalid_resolution:"رزولوشن نامعتبر است.",
  invalid_duration:"مدت ویدیو نامعتبر است.",
  media_upstream_error:"ساخت ویدیو موقتا در دسترس نیست.",
  media_failed:"ساخت ویدیو موقتا در دسترس نیست.",
  upstream_error:"ساخت ویدیو موقتا در دسترس نیست.",
  upstream_timeout:"ساخت ویدیو موقتا در دسترس نیست."
};
function pgSetImgErr(msg){
  var el=$("pg-img-err");
  if(!el) return;
  if(!msg){ el.hidden=true; el.textContent=""; } else { el.hidden=false; el.textContent=msg; }
}
function pgSetVidErr(msg){
  var el=$("pg-vid-err");
  if(!el) return;
  if(!msg){ el.hidden=true; el.textContent=""; } else { el.hidden=false; el.textContent=msg; }
}
function pgMapImgErr(err){
  var code=err&&err.code?String(err.code):"";
  if(code&&IMG_ERR_FA[code]) return IMG_ERR_FA[code];
  if(err&&err.message&&String(err.message).trim()) return String(err.message);
  return "خطای غیرمنتظره";
}
function pgMapVidErr(err){
  var code=err&&err.code?String(err.code):"";
  if(code&&VID_ERR_FA[code]) return VID_ERR_FA[code];
  if(err&&err.message&&String(err.message).trim()) return String(err.message);
  return "خطای غیرمنتظره";
}
function wireImage(){
  var promptEl=$("pg-img-prompt");
  var goBtn=$("pg-img-go");
  var arEl=$("pg-img-ar");
  var resEl=$("pg-img-res");
  var costEl=$("pg-img-cost");
  var gridEl=$("pg-img-grid");
  if(!goBtn) return;
  if(!STATE.img) STATE.img={busy:false};
  if(typeof STATE.img.n!=="number"||!(STATE.img.n>=1&&STATE.img.n<=4)) STATE.img.n=1;
  var panel=$("pg-panel-image");
  var segs=qa(".pg-seg[data-n]", panel||document);
  segs.forEach(function(b){
    var n=parseInt(b.getAttribute("data-n"),10);
    if(n===STATE.img.n) b.classList.add("active");
    else b.classList.remove("active");
    b.addEventListener("click", function(){
      var v=parseInt(b.getAttribute("data-n"),10);
      if(!isFinite(v)||v<1||v>4) return;
      STATE.img.n=v;
      segs.forEach(function(x){ x.classList.remove("active"); });
      b.classList.add("active");
    });
  });
  goBtn.addEventListener("click", async function(){
    if(STATE.img.busy) return;
    var prompt=promptEl?promptEl.value.trim():"";
    if(!prompt||prompt.length<1){
      pgSetImgErr("توصیف تصویر را بنویسید.");
      return;
    }
    if(prompt.length>4000){
      pgSetImgErr("توصیف تصویر نامعتبر است.");
      return;
    }
    var n=STATE.img.n||1;
    if(typeof n!=="number"||n<1||n>4) n=1;
    var body={prompt:prompt,n:n};
    if(arEl&&arEl.value) body.aspect_ratio=arEl.value;
    if(resEl&&resEl.value) body.resolution=resEl.value;
    STATE.img.busy=true;
    var prevText=goBtn.textContent;
    goBtn.textContent="در حال ساخت…";
    goBtn.disabled=true;
    pgSetImgErr("");
    try{
      var res=await api("/api/playground/image",{method:"POST",body:JSON.stringify(body)});
      var list=(res&&res.data)||[];
      if(!Array.isArray(list)) list=[];
      if(costEl){
        var c=res&&res.cost_usd;
        if(c!=null&&isFinite(Number(c))){
          var fixed=Number(c).toFixed(2);
          var faCost=faNum(fixed);
          costEl.textContent="هزینه: ~$"+faCost;
        } else {
          costEl.textContent="";
        }
      }
      if(gridEl&&list.length){
        var ts=Date.now();
        var frag=document.createDocumentFragment();
        for(var i=0;i<list.length;i++){
          var item=list[i]||{};
          var b64=item.b64_json||item.b64||"";
          if(!b64) continue;
          var card=document.createElement("div");
          card.className="pg-img-card";
          var img=document.createElement("img");
          var dataUri="data:image/png;base64,"+b64;
          img.src=dataUri;
          img.alt="";
          img.style.width="100%";
          img.style.display="block";
          img.style.borderRadius="10px";
          var dl=document.createElement("a");
          dl.className="pg-img-dl";
          dl.href=dataUri;
          dl.download="codism-image-"+ts+"-"+i+".png";
          dl.textContent="دانلود";
          dl.style.display="inline-flex";
          dl.style.marginTop=".5rem";
          dl.style.fontSize=".85rem";
          dl.style.color="var(--ink-700)";
          card.appendChild(img);
          card.appendChild(dl);
          card.style.background="var(--white)";
          card.style.border="1px solid var(--cream-200)";
          card.style.borderRadius="12px";
          card.style.padding=".5rem";
          frag.appendChild(card);
        }
        if(frag.childNodes.length){
          if(gridEl.firstChild) gridEl.insertBefore(frag, gridEl.firstChild);
          else gridEl.appendChild(frag);
        }
      }
    }catch(e){
      var msg=pgMapImgErr(e);
      pgSetImgErr(msg);
    }finally{
      STATE.img.busy=false;
      goBtn.disabled=false;
      goBtn.textContent="ساخت تصویر";
    }
  });
}
function wireVideo(){
  var promptEl=$("pg-vid-prompt");
  var durEl=$("pg-vid-dur");
  var durVal=$("pg-vid-dur-val");
  var arEl=$("pg-vid-ar");
  var resEl=$("pg-vid-res");
  var goBtn=$("pg-vid-go");
  var progEl=$("pg-vid-prog");
  var barEl=$("pg-vid-bar");
  var statusEl=$("pg-vid-status");
  var resultEl=$("pg-vid-result");
  var playerEl=$("pg-vid-player");
  var dlEl=$("pg-vid-dl");
  if(!goBtn) return;
  if(!STATE.vid) STATE.vid={busy:false,poll:null};
  function updateDurBadge(){
    if(!durEl||!durVal) return;
    var v=parseInt(durEl.value,10);
    if(!isFinite(v)) v=8;
    durVal.textContent=faNum(v)+" ثانیه";
  }
  if(durEl){
    durEl.addEventListener("input", updateDurBadge);
    updateDurBadge();
  }
  goBtn.addEventListener("click", async function(){
    if(STATE.vid.busy) return;
    var prompt=promptEl?promptEl.value.trim():"";
    if(!prompt){
      pgSetVidErr("توصیف ویدیو را بنویسید.");
      return;
    }
    if(prompt.length>4000){
      pgSetVidErr("توصیف ویدیو نامعتبر است.");
      return;
    }
    var dur=durEl?parseInt(durEl.value,10):8;
    if(!isFinite(dur)||dur<1||dur>15) dur=8;
    var body={prompt:prompt,duration:dur};
    if(arEl&&arEl.value) body.aspect_ratio=arEl.value;
    if(resEl&&resEl.value) body.resolution=resEl.value;
    STATE.vid.busy=true;
    goBtn.disabled=true;
    goBtn.textContent="در حال ساخت…";
    pgSetVidErr("");
    if(progEl) progEl.hidden=false;
    if(resultEl) resultEl.hidden=true;
    if(barEl) barEl.style.width="0%";
    if(statusEl) statusEl.textContent="در صف ساخت…";
    var requestId=null;
    try{
      var res=await api("/api/playground/video",{method:"POST",body:JSON.stringify(body)});
      requestId=res&&res.request_id?String(res.request_id):"";
      if(!requestId){
        throw {code:"upstream_error",message:"خطای غیرمنتظره"};
      }
    }catch(e){
      var msg=pgMapVidErr(e);
      pgSetVidErr(msg);
      if(progEl) progEl.hidden=true;
      STATE.vid.busy=false;
      goBtn.disabled=false;
      goBtn.textContent="ساخت ویدیو";
      return;
    }
    var misses=0;
    if(STATE.vid.poll){ try{ clearInterval(STATE.vid.poll);}catch(e2){} STATE.vid.poll=null; }
    async function pollFn(){
      try{
        var st=await api("/api/playground/video/status",{method:"POST",body:JSON.stringify({request_id:requestId})});
        misses=0;
        var status=st&&st.status?String(st.status):"pending";
        var progress=st&&st.progress!=null?Number(st.progress):0;
        if(status==="pending"){
          if(barEl) barEl.style.width=(isFinite(progress)?progress:0)+"%";
          if(statusEl) statusEl.textContent="در حال ساخت… "+faNum(isFinite(progress)?progress:0)+"٪";
          return;
        }
        if(status==="done"){
          if(STATE.vid.poll){ clearInterval(STATE.vid.poll); STATE.vid.poll=null; }
          if(progEl) progEl.hidden=true;
          if(resultEl) resultEl.hidden=false;
          var url=st&&st.video_url?String(st.video_url):"";
          if(playerEl){
            playerEl.src=url;
            try{ playerEl.load(); }catch(e3){}
          }
          if(dlEl){
            dlEl.href=url;
            dlEl.download="codism-video-"+requestId+".mp4";
          }
          if(statusEl){
            var txt="آماده شد";
            var cost=st&&st.cost_usd;
            if(cost!=null&&isFinite(Number(cost))){
              var fixed=Number(cost).toFixed(2);
              txt+=" · هزینه: ~$"+faNum(fixed);
            }
            statusEl.textContent=txt;
            statusEl.hidden=false;
          }
          if(barEl) barEl.style.width="100%";
          STATE.vid.busy=false;
          goBtn.disabled=false;
          goBtn.textContent="ساخت ویدیو";
          return;
        }
        if(status==="failed"){
          if(STATE.vid.poll){ clearInterval(STATE.vid.poll); STATE.vid.poll=null; }
          if(progEl) progEl.hidden=true;
          var errMsg=st&&st.error?String(st.error):"";
          pgSetVidErr("ساخت ویدیو ناموفق بود"+(errMsg?" — "+errMsg:""));
          STATE.vid.busy=false;
          goBtn.disabled=false;
          goBtn.textContent="ساخت ویدیو";
          return;
        }
        if(barEl) barEl.style.width=(isFinite(progress)?progress:0)+"%";
        if(statusEl) statusEl.textContent="در حال ساخت… "+faNum(isFinite(progress)?progress:0)+"٪";
      }catch(e4){
        misses++;
        if(misses>=5){
          if(STATE.vid.poll){ clearInterval(STATE.vid.poll); STATE.vid.poll=null; }
          if(progEl) progEl.hidden=true;
          pgSetVidErr("ساخت ویدیو ناموفق بود — خطا در ارتباط");
          STATE.vid.busy=false;
          goBtn.disabled=false;
          goBtn.textContent="ساخت ویدیو";
        }
      }
    }
    STATE.vid.poll=setInterval(pollFn,4000);
  });
}
wireImage();
wireVideo();


})();

