(() => {
  "use strict";
  const API_BASE = (typeof window !== "undefined" && window.CODISM_API_BASE) || "";
  const T = () => localStorage.getItem("codism_token");
  const H = () => {
    const t = T();
    if (!t) { location.replace("login.html"); throw new Error("no session"); }
    return { Authorization: "Bearer " + t, "Content-Type": "application/json" };
  }; // never sends "Bearer null"

  if (!T()) {
    location.replace("login.html");
    return;
  }

  const STATE = { me: null, usage: null, keys: [], models: [], adminStats: null };

  const PLAN_FA = {
    starter: "استارتر",
    basic: "بیسیک",
    pro: "حرفه‌ای",
    scale: "مقیاس",
    unlimited: "نامحدود",
  };

  const HINTS = {
    invalid_api_key: "کلید نامعتبر",
    missing_api_key: "کلید ارسال نشده",
    key_disabled: "کلید غیرفعال",
    user_disabled: "حساب غیرفعال",
    model_not_allowed: "این مدل برای کلید شما مجاز نیست",
    daily_quota_exceeded: "سهمیه روزانه تمام شد",
    monthly_quota_exceeded: "سهمیه ماهانه تمام شد",
    upstream_challenge: "سرویس موقتا در دسترس نیست",
    upstream_error: "سرویس موقتا در دسترس نیست",
    upstream_timeout: "پاسخ سرویس طولانی شد",
    body_too_large: "حجم درخواست بیش از حد",
    not_found: "مسیر اشتباه",
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function faNum(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return esc(String(n));
    try {
      if (typeof window !== "undefined" && window.I18N && window.I18N.lang === "en") return v.toLocaleString("en-US");
      return v.toLocaleString("fa-IR");
    } catch {
      return String(v);
    }
  }

  function LOC() { return (typeof window !== "undefined" && window.I18N && window.I18N.lang === "en") ? "en-US" : "fa-IR"; }
  function TR(fa, en) { return (typeof window !== "undefined" && window.I18N && window.I18N.lang === "en") ? en : fa; }

  function fmtTok(n) {
    const v = Number(n) || 0;
    if (v >= 1e9) return faNum((v / 1e9).toFixed(1)) + "B";
    if (v >= 1e6) return faNum((v / 1e6).toFixed(1)) + "M";
    if (v >= 1e3) return faNum((v / 1e3).toFixed(1)) + "K";
    return faNum(v);
  }

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function setText(sel, txt) {
    const el = q(sel);
    if (el) el.textContent = txt;
  }
  function setHTML(sel, html) {
    const el = q(sel);
    if (el) el.innerHTML = html;
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = H();
    if (o.headers) Object.assign(headers, o.headers);
    const res = await fetch(API_BASE + path, { ...o, headers });
    if (res.status === 401) {
      localStorage.removeItem("codism_token");
      location.replace("login.html");
      const e = new Error("نشست منقضی شد");
      e.code = "unauthorized";
      e.status = 401;
      throw e;
    }
    if (!res.ok) {
      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      const code = (body && body.error && body.error.code) || "";
      const message = (body && body.error && body.error.message) || "خطای غیرمنتظره";
      const err = new Error(message);
      err.code = code;
      err.message = message;
      err.status = res.status;
      err.body = body;
      if (code && typeof window !== "undefined" && window.I18N && window.I18N.lang === "en" && window.I18N.codeMap && window.I18N.codeMap[code]) err.message = window.I18N.codeMap[code];
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      return txt;
    }
  }

  function renderChart(container, rows) {
    if (!container) return;
    container.innerHTML = "";
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="empty-row" style="padding:1rem;text-align:center;color:#8A8475">داده‌ای برای نمایش وجود ندارد</div>';
      return;
    }
    const max = Math.max(
      ...rows.map((r) => {
        if (r.tokens != null) return Number(r.tokens) || 0;
        return (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0);
      }),
      1
    );
    const barsWrap = document.createElement("div");
    barsWrap.className = "chart-bars";
    barsWrap.style.display = "flex";
    barsWrap.style.alignItems = "end";
    barsWrap.style.gap = "4px";
    barsWrap.style.height = "120px";
    barsWrap.style.padding = "8px 0";
    rows.forEach((r, i) => {
      const tok = r.tokens != null ? Number(r.tokens) || 0 : (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0);
      const h = Math.max(2, Math.round((tok / max) * 100));
      const bar = document.createElement("i");
      bar.style.display = "block";
      bar.style.flex = "1";
      bar.style.height = h + "%";
      bar.style.background = i === rows.length - 1 ? "#D97757" : "#E8E2D5";
      bar.style.borderRadius = "4px 4px 0 0";
      bar.style.minWidth = "6px";
      if (i === rows.length - 1) bar.classList.add("hot");
      bar.setAttribute("data-v", faNum(tok));
      bar.setAttribute("data-day", String(r.day || ""));
      bar.title = String(r.day || "") + " : " + faNum(tok) + " توکن";
      barsWrap.appendChild(bar);
    });
    const x = document.createElement("div");
    x.className = "chart-x";
    x.style.display = "flex";
    x.style.justifyContent = "space-between";
    x.style.fontSize = ".75rem";
    x.style.color = "#8A8475";
    x.style.direction = "ltr";
    const fmtDay = (d) => (d ? String(d).slice(5) : "");
    const first = rows[0] ? rows[0].day : "";
    const last = rows[rows.length - 1] ? rows[rows.length - 1].day : "";
    x.innerHTML = "<span>" + esc(fmtDay(first)) + "</span><span>" + esc(fmtDay(last)) + "</span>";
    container.appendChild(barsWrap);
    container.appendChild(x);
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt);
    }
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    ta.remove();
    return Promise.resolve();
  }

  function showToast(msg, ok) {
    let el = q("[data-toast]");
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("data-toast", "");
      el.style.position = "fixed";
      el.style.bottom = "1rem";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.padding = ".75rem 1rem";
      el.style.borderRadius = "8px";
      el.style.fontSize = ".875rem";
      el.style.zIndex = "9999";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
    el.style.color = ok ? "#059669" : "#DC2626";
    el.style.border = "1px solid " + (ok ? "#A7F3D0" : "#FECACA");
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), 2500);
  }

  // Modal helpers
  function openModal(id) {
    const m = document.getElementById(id) || q('[data-modal="' + esc(id) + '"]') || q("#" + CSS.escape(id));
    if (m) {
      m.classList.remove("hidden");
      m.removeAttribute("hidden");
      m.style.display = "";
      m.setAttribute("aria-hidden", "false");
    } else {
      const alt = q('[data-modal-id="' + esc(id) + '"]');
      if (alt) {
        alt.classList.remove("hidden");
        alt.removeAttribute("hidden");
        alt.style.display = "";
      }
    }
  }
  function closeModal(el) {
    if (!el) return;
    const back = el.closest ? el.closest(".modal-back") : null;
    const target = back || el;
    target.classList.add("hidden");
    target.setAttribute("hidden", "");
    target.style.display = "none";
    target.setAttribute("aria-hidden", "true");
  }
  function closeAllModals() {
    qa(".modal-back").forEach((m) => {
      m.classList.add("hidden");
      m.setAttribute("hidden", "");
      m.style.display = "none";
      m.setAttribute("aria-hidden", "true");
    });
    qa("[data-modal]").forEach((m) => {
      m.classList.add("hidden");
      m.setAttribute("hidden", "");
      m.style.display = "none";
    });
  }

  // Header bits
  function setupHeader() {
    const emailEls = qa("[data-user-email]");
    const baseEls = qa("[data-base-url]");
    const baseUrl = API_BASE + "/v1";
    baseEls.forEach((el) => {
      el.textContent = baseUrl;
      el.setAttribute("dir", "ltr");
      el.style.cursor = "pointer";
      el.title = "کپی";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        copyText(baseUrl).then(() => showToast(TR("کپی شد", "Copied"), true));
      });
    });
    // logout transform
    qa("a[data-auth-cta]").forEach((a) => {
      a.style.display = "none";
    });
    qa("a[data-auth-link]").forEach((a) => {
      a.textContent = TR("خروج", "Logout");
      a.style.display = "";
      a.setAttribute("href", "#");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("codism_token");
        location.replace("login.html");
      });
    });
    // also handle any button with data-logout
    qa("[data-logout]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("codism_token");
        location.replace("login.html");
      });
    });
    if (STATE.me && STATE.me.user) {
      emailEls.forEach((el) => (el.textContent = STATE.me.user.email || ""));
    }
  }

  // Views / tabs
  const VIEW_LOADERS = {};
  let currentView = null;

  function switchView(name, pushHash) {
    const btns = qa("[data-view]");
    const sections = qa("section.view, [data-view-section], .view");
    // normalize name
    const target = name ? String(name).replace(/^#/, "") : "overview";
    currentView = target;
    btns.forEach((b) => {
      const v = b.getAttribute("data-view");
      if (v === target) b.classList.add("active");
      else b.classList.remove("active");
    });
    sections.forEach((s) => {
      const raw = s.id || s.getAttribute("data-view") || s.getAttribute("data-view-section");
      if (!raw) return;
      const id = String(raw).replace(/^view-/, "");
      const on = id === target;
      s.classList.toggle("active", on);
      s.classList.toggle("hidden", !on);
    });
    // fallback: if no section matched, try by id
    const byId = document.getElementById("view-" + target) || document.getElementById(target);
    if (byId && byId.classList.contains("view")) {
      qa("section.view").forEach((s) => { s.classList.remove("active"); s.classList.add("hidden"); });
      byId.classList.add("active");
      byId.classList.remove("hidden");
    }
    if (pushHash !== false) {
      if (location.hash !== "#" + target) history.replaceState(null, "", "#" + target);
    }
    const loader = VIEW_LOADERS[target];
    if (loader) loader().catch((err) => console.error(err));
  }

  function setupTabs() {
    qa("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.getAttribute("data-view");
        if (v) switchView(v, true);
      });
    });
    window.addEventListener("hashchange", () => {
      const h = location.hash.replace(/^#/, "") || "overview";
      switchView(h, false);
    });
  }

  function updateAdminVisibility() {
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    qa("[data-admin]").forEach((el) => {
      if (isAdmin) {
        el.removeAttribute("hidden");
        el.classList.remove("hidden");
        el.style.display = "";
      } else {
        el.setAttribute("hidden", "");
        el.classList.add("hidden");
        el.style.display = "none";
      }
    });
  }

  // Loader: overview
  async function loadOverview() {
    try {
      const mePromise = STATE.me ? Promise.resolve(STATE.me) : api("/api/me");
      const [meRes, keysRes, usageRes] = await Promise.all([
        mePromise,
        api("/api/keys").catch(() => []),
        api("/api/usage?days=14").catch(() => null),
      ]);
      if (meRes && meRes.user) {
        STATE.me = meRes;
        setupHeader();
        updateAdminVisibility();
      }
      const me = meRes;
      const keys = Array.isArray(keysRes) ? keysRes : [];
      STATE.keys = keys;
      const today = me.today || { requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      const month = me.month || { requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      const planKey = (me.user && me.user.plan) || "starter";
      const planFa = PLAN_FA[planKey] || PLAN_FA.starter;
      setText("[data-plan-name]", planFa);
      setText("[data-plan-name2]", planFa);
      const monthTok = (Number(month.prompt_tokens) || 0) + (Number(month.completion_tokens) || 0);
      const todayTok = (Number(today.prompt_tokens) || 0) + (Number(today.completion_tokens) || 0);
      setText("[data-kpi-month-tok]", fmtTok(monthTok));
      setText("[data-kpi-today-req]", faNum(today.requests || 0));
      setText("[data-kpi-today-tok]", fmtTok(todayTok));
      const enabledCount = keys.filter((k) => k.enabled).length;
      setText("[data-plan-keys]", faNum(enabledCount));
      const exp = me.user && me.user.subscription_expires_at;
      const subLine = q("[data-sub-line]");
      if(subLine){
        if(!exp){subLine.hidden=true;}
        else {
          subLine.hidden=false;
          const ms=Date.parse(exp)-Date.now();
          const rem=q("[data-sub-remaining]");
          if(rem){
            if(ms<=0) rem.textContent=TR("منقضی شده","Expired");
            else {
              const days=Math.floor(ms/86400000), hours=Math.floor((ms%86400000)/3600000);
              rem.textContent = days>=1 ? faNum(days)+" "+TR("روز باقی‌مانده","days remaining") : faNum(hours)+" "+TR("ساعت باقی‌مانده","hours remaining");
            }
          }
          if(ms<7*86400000 && ms>0) rem.style.color="#DC2626";
          else if(rem) rem.style.color="";
        }
      }
      // quota
      const quota = me.user ? me.user.monthly_quota_tokens : null;
      const quotaEl = q("[data-plan-quota]");
      if (quotaEl) {
        quotaEl.textContent = quota == null || quota === 0 ? "نامحدود" : fmtTok(quota) + " توکن";
      }
      const progressTextEl = q("[data-plan-progress]");
      const progressFill = q("[data-plan-fill]") || q(".progress > i") || q("[data-plan-progress-bar]");
      const hintEl = q("[data-plan-hint]") || q("[data-plan-progress-hint]");
      let pct = 0;
      if (quota != null && quota > 0) pct = Math.min(100, Math.round((monthTok / quota) * 100));
      if (progressFill) progressFill.style.width = pct + "%";
      // also if progressTextEl is the bar itself, set width
      if (progressTextEl && progressTextEl.classList.contains("progress")) {
        const inner = progressTextEl.querySelector("i");
        if (inner) inner.style.width = pct + "%";
      } else if (progressTextEl) {
        if (quota == null || quota === 0) progressTextEl.textContent = "بدون سقف";
        else progressTextEl.textContent = "از " + fmtTok(quota) + " سهمیه";
      }
      // hint percent
      const hintText = quota == null || quota === 0 ? "بدون سقف" : faNum(pct) + "% از سهمیه مصرف شده";
      if (hintEl) hintEl.textContent = hintText;
      // also try generic hint
      const genericHint = q("[data-quota-hint]");
      if (genericHint) genericHint.textContent = hintText;

      // chart
      const usage = usageRes;
      if (usage) STATE.usage = usage;
      const chartContainers = qa("[data-overview-chart], [data-chart], [data-usage-chart-overview], #overview-chart");
      const byDay = usage && usage.by_day ? usage.by_day : [];
      chartContainers.forEach((c) => renderChart(c, byDay));
      // also overview specific
      const overviewChart = q("[data-chart]");
      if (overviewChart && !chartContainers.includes(overviewChart)) renderChart(overviewChart, byDay);

      // failed today
      const recent = (usage && usage.recent) || [];
      const failedCount = recent.filter((r) => Number(r.status) >= 400).length;
      const failedEls = qa("[data-kpi-failed], [data-failed-today], [data-kpi-failed-today]");
      failedEls.forEach((el) => (el.textContent = faNum(failedCount)));
      // sub label stays as is
    } catch (e) {
      console.error("overview", e);
    }
  }

  // Loader: keys
  async function loadKeys() {
    try {
      const keys = await api("/api/keys");
      STATE.keys = Array.isArray(keys) ? keys : [];
      // models for select
      let models = STATE.models;
      if (!models || !models.length) {
        try {
          const mRes = await api("/api/models");
          models = (mRes && mRes.data) || [];
          STATE.models = models;
        } catch {
          models = [];
        }
      }
      const sel = q("[data-key-models]");
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = "";
        models.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.id;
          opt.setAttribute("dir", "ltr");
          sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
      }

      const tbody = q("[data-keys-body]");
      if (tbody) {
        tbody.innerHTML = "";
        if (!STATE.keys.length) {
          const tr = document.createElement("tr");
          tr.innerHTML = '<td colspan="6" style="text-align:center;padding:1.5rem;color:#8A8475">هنوز کلیدی نساخته‌اید</td>';
          tbody.appendChild(tr);
        } else {
          STATE.keys.forEach((k) => {
            const tr = document.createElement("tr");
            const label = k.label ? esc(k.label) : "بدون برچسب";
            const keyVal = String(k.key || "");
            const masked = keyVal ? esc(keyVal.slice(0, 9) + "…" + keyVal.slice(-4)) : "—";
            const enabledBadge = k.enabled ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-bad">غیرفعال</span>';
            const modelsTxt = k.models === "*" || !k.models ? "همه مدل‌ها" : esc(String(k.models));
            const modelsCell = k.models === "*" ? "همه مدل‌ها" : '<span style="font-family:var(--font-mono);font-size:.75rem;direction:ltr;display:inline-block">' + esc(String(k.models)) + "</span>";
            let dateStr = "—";
            try {
              const d = new Date(k.created_at);
              dateStr = esc(d.toLocaleDateString(LOC())) + ' <small dir="ltr" style="color:#8A8475">' + esc(d.toLocaleTimeString(LOC())) + "</small>";
            } catch {}
            tr.innerHTML =
              '<td>' + label + "</td>" +
              '<td><code class="kbd" dir="ltr">' + masked + '</code> <button class="btn btn-ghost btn-sm" data-copy-key="' + esc(keyVal) + '">کپی</button></td>' +
              "<td>" + enabledBadge + "</td>" +
              "<td>" + modelsCell + "</td>" +
              '<td dir="ltr">' + dateStr + "</td>" +
              '<td><button class="btn btn-ghost btn-sm" data-key-settings="' + esc(String(k.id)) + '">' + TR("تنظیمات", "Settings") + '</button> <button class="btn btn-ghost btn-sm" data-del-key="' + esc(String(k.id)) + '">' + TR("حذف", "Delete") + "</button></td>";
            tbody.appendChild(tr);
          });
          // bind copy
          qa("[data-copy-key]", tbody).forEach((b) => {
            b.addEventListener("click", () => {
              const v = b.getAttribute("data-copy-key") || "";
              copyText(v).then(() => showToast("کپی شد", true));
            });
          });
          qa("[data-del-key]", tbody).forEach((b) => {
            b.addEventListener("click", async () => {
              if (!confirm("این کلید حذف شود؟")) return;
              const id = b.getAttribute("data-del-key");
              try {
                await api("/api/keys/" + encodeURIComponent(id), { method: "DELETE" });
                showToast("کلید حذف شد", true);
                loadKeys();
                // also refresh overview quota keys count
                loadOverview();
              } catch (e) {
                showToast(e.message || "خطای غیرمنتظره", false);
              }
            });
          });
          qa("[data-key-settings]", tbody).forEach((b) => {
            b.addEventListener("click", () => {
              const id = b.getAttribute("data-key-settings");
              const k = (STATE.keys || []).find((x) => String(x.id) === String(id));
              if (!k) return;
              const modal = q("#keySettingsModal");
              if (!modal) return;
              modal.dataset.keyId = String(k.id);
              const saver = q("[data-ks-saver]");
              if (saver) saver.value = String(k.token_saver || "off");
              const dbg = q("[data-ks-debug]");
              if (dbg) dbg.checked = !!k.debug;
              const modelsEl = q("[data-ks-models]");
              if (modelsEl) modelsEl.value = Array.isArray(k.models) ? k.models.join(", ") : (k.models || "");
              openModal("keySettingsModal");


            });
          });
        }
      }
    } catch (e) {
      console.error("keys", e);
      const tbody = q("[data-keys-body]");
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#DC2626;padding:1rem">' + esc(e.message || "خطای غیرمنتظره") + "</td></tr>";
    }
  }

  // Loader: usage
  async function loadUsage() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    try {
      const usage = await api("/api/usage?days=14");
      STATE.usage = usage;
      const today = usage.today || { requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      const month = usage.month || { requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      const byDay = usage.by_day || [];
      const recent = usage.recent || [];

      // kpis
      const todayTok = (Number(today.prompt_tokens) || 0) + (Number(today.completion_tokens) || 0);
      const monthTok = (Number(month.prompt_tokens) || 0) + (Number(month.completion_tokens) || 0);
      const avg = byDay.length ? Math.round(byDay.reduce((a, r) => a + (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0), 0) / byDay.length) : 0;
      // today in Tehran = UTC + 210min
      const tehranToday = new Date(Date.now() + 210 * 60000).toISOString().slice(0, 10);
      const failed = recent.filter((r) => Number(r.status) >= 400 && String(r.ts || "").slice(0, 10) === tehranToday).length;

      // try multiple selectors
      setText("[data-usage-today-tok]", fmtTok(todayTok));
      setText("[data-usage-today-req]", faNum(today.requests || 0));
      setText("[data-kpi-today-tok]", fmtTok(todayTok));
      setText("[data-kpi-today-req]", faNum(today.requests || 0));
      setText("[data-usage-month-tok]", fmtTok(monthTok));
      setText("[data-usage-month-req]", faNum(month.requests || 0));
      setText("[data-kpi-month-tok]", fmtTok(monthTok));
      setText("[data-kpi-month-req]", faNum(month.requests || 0));
      setText("[data-usage-avg]", fmtTok(avg));
      setText("[data-kpi-avg]", fmtTok(avg));
      setText("[data-usage-failed]", faNum(failed));
      setText("[data-kpi-failed]", faNum(failed));
      // generic
      qa("[data-kpi-usage-avg]").forEach((el) => (el.textContent = fmtTok(avg)));
      qa("[data-kpi-usage-failed]").forEach((el) => (el.textContent = faNum(failed)));
      const quota = STATE.me && STATE.me.user ? Number(STATE.me.user.monthly_quota_tokens) || 0 : 0;
      if (quota > 0) {
        const v = fmtTok(monthTok) + " " + TR("از", "of") + " " + fmtTok(quota);
        const pct = Math.min(100, Math.round(monthTok / quota * 100));
        setText("[data-usage-quota]", v);
        setText("[data-usage-quota-pct]", faNum(pct) + TR("٪ از سهمیه مصرف شده", "% of quota used"));
      } else {
        setText("[data-usage-quota]", TR("نامحدود", "Unlimited"));
        setText("[data-usage-quota-pct]", "");
      }

      // C-2: estimated cost + saved tokens + reset countdown
      const est = Number(usage.est_cost_usd) || 0;
      setText("[data-usage-cost]", "$" + est.toFixed(2));
      setText("[data-usage-cost-toman]", TR("≈ " + faNum(Math.round(est * 200000)) + " تومان", "≈ " + Math.round(est * 200000).toLocaleString("en-US") + " toman"));

      const savedM = Number(month.saved_tokens) || 0;
      setText("[data-usage-saved]", fmtTok(savedM));
      try {
        const nowT = new Date(Date.now() + 210 * 60000);
        const endT = new Date(Date.UTC(nowT.getUTCFullYear(), nowT.getUTCMonth() + 1, 1));
        const hrsLeft = Math.max(0, endT.getTime() - nowT.getTime()) / 3600000;
        const dLeft = Math.floor(hrsLeft / 24), hLeft = Math.round(hrsLeft % 24);
        setText("[data-reset-countdown]", TR(faNum(dLeft) + " روز و " + faNum(hLeft) + " ساعت", dLeft + "d " + hLeft + "h"));
      } catch {}

      // chart
      const chartEls = qa("[data-usage-chart], [data-chart-usage], [data-overview-chart], [data-chart]");
      // prefer usage chart
      const usageChart = q("[data-usage-chart]") || q("[data-chart]") || q("#usage-chart");
      if (usageChart) renderChart(usageChart, byDay);
      else chartEls.forEach((c) => renderChart(c, byDay));

      // by-model derived from recent
      const byModelBody = q("[data-by-model-body]") || q("[data-usage-by-model]") || q("[data-model-body]");
      if (byModelBody) {
        byModelBody.innerHTML = "";
        if (!recent.length) {
          byModelBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1rem;color:#8A8475">هنوز درخواستی ثبت نشده</td></tr>';
        } else {
          const groups = {};
          recent.forEach((r) => {
            const m = r.model || "—";
            if (!groups[m]) groups[m] = { model: m, requests: 0, prompt: 0, completion: 0 };
            groups[m].requests += 1;
            groups[m].prompt += Number(r.prompt_tokens) || 0;
            groups[m].completion += Number(r.completion_tokens) || 0;
          });
          const rows = Object.values(groups);
          // sub label
          const sub = q("[data-by-model-sub]");
          if (sub) sub.textContent = "از ۲۵ درخواست اخیر";
          if (!rows.length) {
            byModelBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1rem;color:#8A8475">هنوز درخواستی ثبت نشده</td></tr>';
          } else {
            rows.forEach((g) => {
              const tr = document.createElement("tr");
              tr.innerHTML =
                '<td><span style="font-family:var(--font-mono);direction:ltr;display:inline-block">' + esc(g.model) + "</span></td>" +
                "<td>" + faNum(g.requests) + "</td>" +
                "<td>" + faNum(g.prompt) + "</td>" +
                "<td>" + faNum(g.completion) + "</td>";
              byModelBody.appendChild(tr);
            });
          }
        }
      }

      // recent table
      const recentBody = q("[data-recent-body]") || q("[data-usage-recent-body]") || q("[data-recent]");
      if (recentBody) {
        recentBody.innerHTML = "";
        if (!recent.length) {
          recentBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#8A8475">موردی ثبت نشده</td></tr>';
        } else {
          recent.forEach((r) => {
            const tr = document.createElement("tr");
            let timeStr = "—";
            try {
              const d = new Date(r.ts);
              timeStr = esc(d.toLocaleDateString(LOC())) + " " + esc(d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" }));
            } catch {}
            const route = r.route ? '<code class="kbd" dir="ltr" style="font-size:.75rem">' + esc(r.route) + "</code>" : "—";
            const model = r.model ? '<span dir="ltr" style="font-family:var(--font-mono);font-size:.75rem">' + esc(r.model) + "</span>" : "—";
            const isOk = Number(r.status) < 400;
            const badge = isOk ? '<span class="badge badge-ok">' + esc(String(r.status)) + "</span>" : '<span class="badge badge-bad">' + esc(String(r.status)) + "</span>";
            const hint = !isOk && r.error_code ? '<div style="font-size:.75rem;color:#DC2626;margin-top:2px">' + esc(HINTS[r.error_code] || r.error_code) + "</div>" : "";
            const tok = isOk ? faNum((Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0)) + " توکن" : (HINTS[r.error_code] ? esc(HINTS[r.error_code]) : "");
            tr.innerHTML =
              "<td>" + esc(timeStr) + "</td>" +
              "<td>" + route + "</td>" +
              "<td>" + model + "</td>" +
              "<td>" + badge + hint + "</td>" +
              '<td dir="ltr">' + esc(tok) + "</td>";
            recentBody.appendChild(tr);
          });
        }
      }

      // export buttons
      // note: export always uses authed fetch+blob (raw href would 401 — endpoint needs Authorization header)
      qa("[data-export]").forEach((el) => {
        const fmt = el.getAttribute("data-export") || el.getAttribute("data-format") || "csv";
        const href = API_BASE + "/api/usage/export?format=" + encodeURIComponent(fmt) + "&days=90";
        el.addEventListener("click", (e) => {
          e.preventDefault();
          fetch(href, { headers: H() })
            .then((res) => {
              if (!res.ok) throw new Error(res.status === 401 ? "نشست شما منقضی شده — دوباره وارد شوید" : "خطای غیرمنتظره");
              return res.blob();
            })
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fmt === "csv" ? "codism-usage.csv" : "codism-usage.json";
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                URL.revokeObjectURL(url);
                a.remove();
              }, 1000);
            })
            .catch((err) => showToast(err.message || "خطای غیرمنتظره", false));
        });
      });
      // also handle generic export links (same authed fetch flow)
      qa("a[data-export-csv], a[data-export-json]").forEach((a) => {
        const fmt = a.hasAttribute("data-export-csv") ? "csv" : "json";
        a.setAttribute("data-export", fmt);
        a.removeAttribute("data-export-csv");
        a.removeAttribute("data-export-json");
        a.addEventListener("click", (e) => {
          e.preventDefault();
          fetch(API_BASE + "/api/usage/export?format=" + fmt + "&days=90", { headers: H() })
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("خطا"))))
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              const tmp = document.createElement("a");
              tmp.href = url;
              tmp.download = fmt === "csv" ? "codism-usage.csv" : "codism-usage.json";
              document.body.appendChild(tmp);
              tmp.click();
              setTimeout(() => { URL.revokeObjectURL(url); tmp.remove(); }, 1000);
            })
            .catch(() => showToast("دریافت گزارش ناموفق بود", false));
        });
      });
    } catch (e) {
      console.error("usage", e);
    }
  }

  // Loader: settings
  async function loadSettings() {
    try {
      if (!STATE.me) STATE.me = await api("/api/me");
      const me = STATE.me;
      const u = me.user || {};
      const emailInput=q("[data-set-email]");
      if(emailInput) emailInput.value=u.email||"";
      setText("[data-set-name]", u.name || "—");
      const planFa = PLAN_FA[u.plan] || PLAN_FA.starter;
      setText("[data-set-plan]", planFa);
      const quota = u.monthly_quota_tokens;
      setText("[data-set-quota]", quota == null || quota === 0 ? TR("نامحدود", "Unlimited") : fmtTok(quota) + " " + TR("توکن", "tokens"));
      let since = "—";
      try {
        if (u.created_at) since = esc(new Date(u.created_at).toLocaleDateString(LOC()));
      } catch {}
      setText("[data-set-since]", since);
      const usernameInput=q("[data-set-username]");
      if(usernameInput) usernameInput.value=u.username||"";
    } catch (e) {
      console.error("settings", e);
    }
  }
  function setupProfileForm(){
    const btn=q("[data-save-profile]");
    if(!btn) return;
    btn.addEventListener("click", async ()=>{
      const emailEl=q("[data-set-email]");
      const usernameEl=q("[data-set-username]");
      const emailVal=emailEl ? emailEl.value.trim() : "";
      const usernameVal=usernameEl ? usernameEl.value.trim() : "";
      try{
        await api("/api/auth/profile",{method:"POST",body:JSON.stringify({email:emailVal,username:usernameVal})});
        showToast(TR("ذخیره شد","Saved"),true);
        STATE.me=null;
        await loadSettings();
      }catch(err){
        showToast(err.message||TR("خطای غیرمنتظره","Unexpected error"),false);
      }
    });
  }

  function setupPasswordForm() {
    const btn = q("[data-save-pw]");
    if (!btn) return;
    const cur = q("[data-pw-current]") || q('input[name="current_password"]') || q("#current_password");
    const nw = q("[data-pw-new]") || q('input[name="new_password"]') || q("#new_password");
    const rep = q("[data-pw-repeat]") || q('input[name="repeat_password"]') || q("#repeat_password");
    const errEl = q("[data-pw-error]") || q("[data-pw-err]");
    const okEl = q("[data-pw-ok]");
    function showErr(msg) {
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove("hidden");
        errEl.removeAttribute("hidden");
        errEl.style.display = "block";
      } else showToast(msg, false);
    }
    function hideErr() {
      if (errEl) {
        errEl.textContent = "";
        errEl.classList.add("hidden");
        errEl.setAttribute("hidden", "");
        errEl.style.display = "none";
      }
    }
    function showOk(msg) {
      if (okEl) {
        okEl.textContent = msg;
        okEl.classList.remove("hidden");
        okEl.removeAttribute("hidden");
        okEl.style.display = "block";
        setTimeout(() => {
          okEl.classList.add("hidden");
          okEl.setAttribute("hidden", "");
          okEl.style.display = "none";
        }, 3000);
      } else showToast(msg, true);
    }
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      hideErr();
      const c = cur ? cur.value : "";
      const n = nw ? nw.value : "";
      const r = rep ? rep.value : "";
      if (!n || n.length < 8) {
        showErr("حداقل ۸ کاراکتر");
        return;
      }
      if (n !== r) {
        showErr("رمزها یکسان نیستند");
        return;
      }
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = "در حال ذخیره…";
      try {
        await api("/api/auth/password", {
          method: "POST",
          body: JSON.stringify({ current_password: c, new_password: n }),
        });
        showOk("رمز عوض شد");
        if (cur) cur.value = "";
        if (nw) nw.value = "";
        if (rep) rep.value = "";
      } catch (err) {
        if (err.code === "invalid_credentials" || err.status === 401) showErr("رمز فعلی اشتباه است.");
        else showErr(err.message || "خطای غیرمنتظره");
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  }

  // Loader: admin-users
  let adminSelectedUser = null;
  function openEditUser(u) {
    adminSelectedUser = u;
    setText("[data-edit-user]", (u.email || u.username || "—") + " / " + (u.name || "—"));
    const un = q("[data-edit-username]");
    if (un) un.value = u.username || "";
    const em = q("[data-edit-email]");
    if (em) em.value = u.email || "";
    const sub = q("[data-edit-sub]");
    if (sub) sub.value = u.subscription_expires_at ? new Date(u.subscription_expires_at).toISOString().slice(0,10) : "";
    fillUpstreamSelects();
    const up = q("[data-edit-upstream]");
    if (up) up.value = u.upstream_key_id ? String(u.upstream_key_id) : "";
    const planSel = q("[data-edit-plan]");
    if (planSel) planSel.value = PLAN_FA[u.plan] ? u.plan : "starter";
    const en = q("[data-edit-enabled]");
    if (en) en.checked = !!u.enabled;
    const m = q("[data-edit-quota-month]");
    if (m) m.value = u.monthly_quota_tokens && u.monthly_quota_tokens > 0 ? String(u.monthly_quota_tokens) : "";
    const d = q("[data-edit-quota-day]");
    if (d) d.value = u.daily_quota_tokens && u.daily_quota_tokens > 0 ? String(u.daily_quota_tokens) : "";
    const pw = q("[data-edit-pass]");
    if (pw) pw.value = "";
    openModal("editUserModal");
  }
  function setupEditUser() {
    const save = q("[data-edit-save]");
    if (save) {
      save.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!adminSelectedUser) return;
        const id = adminSelectedUser.id;
        const planSel = q("[data-edit-plan]");
        const en = q("[data-edit-enabled]");
        const m = q("[data-edit-quota-month]");
        const d = q("[data-edit-quota-day]");
        const pw = q("[data-edit-pass]");
        const payload = {};
        if (planSel) payload.plan = planSel.value || "starter";
        if (en) payload.enabled = !!en.checked;
        if (m) payload.monthly_quota_tokens = m.value.trim() === "" ? 0 : Number(m.value);
        if (d) payload.daily_quota_tokens = d.value.trim() === "" ? 0 : Number(d.value);
        if (!Number.isFinite(payload.monthly_quota_tokens) || !Number.isFinite(payload.daily_quota_tokens)) {
          showToast(TR("عدد نامعتبر", "Invalid number"), false);
          return;
        }
        if (pw && pw.value) {
          if (pw.value.length < 8) { showToast(TR("حداقل ۸ کاراکتر", "At least 8 characters"), false); return; }
          payload.password = pw.value;
        }
        const unEl = q("[data-edit-username]");
        payload.username = unEl ? unEl.value.trim() : "";
        const emEl = q("[data-edit-email]");
        payload.email = emEl ? emEl.value.trim() : "";
        const sv = q("[data-edit-sub]") ? q("[data-edit-sub]").value : "";
        payload.subscription_expires_at = sv ? new Date(sv + "T23:59:59").toISOString() : null;
        const uvEl = q("[data-edit-upstream]");
        payload.upstream_key_id = uvEl && uvEl.value ? uvEl.value : null;
        try {
          await api("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(payload) });
          showToast(TR("تغییرات ذخیره شد", "Changes saved"), true);
          closeAllModals();
          loadAdminUsers();
        } catch (err) {
          const m = String((err && err.message) || "");
          if (/username/i.test(m)) showToast(TR("نام کاربری تکراری است", "Username already exists"), false);
          else if (/email/i.test(m)) showToast(TR("ایمیل تکراری است", "Email already exists"), false);
          else showToast(m || TR("خطای غیرمنتظره", "Unexpected error"), false);
        }
      });
    }
    const del = q("[data-edit-delete]");
    if (del) {
      del.addEventListener("click", async () => {
        if (!adminSelectedUser) return;
        if (!confirm(TR("کاربر و همه کلیدهایش حذف شود؟", "Delete this user and all their keys?"))) return;
        try {
          await api("/api/admin/users/" + encodeURIComponent(adminSelectedUser.id), { method: "DELETE" });
          showToast(TR("کاربر حذف شد", "User deleted"), true);
          closeAllModals();
          loadAdminUsers();
        } catch (err) {
          showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
        }
      });
    }
  }
  async function loadAdminUsers() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      try { STATE.upkeys = await api("/api/admin/upstream-keys"); } catch {}
      const users = await api("/api/admin/users");
      const tbody = q("[data-admin-users-body]");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:1rem;color:#8A8475">کاربری یافت نشد</td></tr>';
        return;
      }
      users.forEach((u) => {
        const tr = document.createElement("tr");
        const planFa = PLAN_FA[u.plan] || esc(u.plan || "starter");
        const enabledBadge = u.enabled ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-bad">غیرفعال</span>';
        const quotaTxt = u.monthly_quota_tokens == null || u.monthly_quota_tokens === 0 ? TR("نامحدود", "Unlimited") : fmtTok(u.monthly_quota_tokens) + " " + TR("توکن", "tokens");
        let dateStr = "—";
        try {
          dateStr = esc(new Date(u.created_at).toLocaleDateString(LOC()));
        } catch {}
        const primary = u.email || u.username || "—";
        let userCell = '<div style="font-weight:600">' + esc(u.name || "—") + '</div><div dir="ltr" style="font-size:.75rem;color:#6B6659">' + esc(primary) + "</div>";
        if (u.email && u.username) {
          const other = primary === u.email ? u.username : u.email;
          userCell += '<div dir="ltr" style="font-size:.75rem;color:#6B6659">' + esc(other) + "</div>";
        }
        let usageCell = fmtTok(Number(u.usage_month_tokens) || 0);
        if (u.usage_month_requests) {
          usageCell += ' <span style="color:#8A8475;font-size:.75rem">(' + faNum(u.usage_month_requests) + ' ' + TR("درخواست", "requests") + ')</span>';
        }
        let subCell;
        if (!u.subscription_expires_at) {
          subCell = TR("بدون انقضا", "No expiry");
        } else {
          const ms = Date.parse(u.subscription_expires_at) - Date.now();
          if (ms <= 0) {
            subCell = '<span style="color:#DC2626">' + TR("منقضی", "Expired") + "</span>";
          } else {
            const days = Math.ceil(ms / 86400000);
            let txt = days >= 1 ? faNum(days) + " " + TR("روز", "days") : TR("کمتر از یک روز", "<1 day");
            if (days <= 7) txt = '<span style="color:#DC2626">' + txt + "</span>";
            subCell = txt;
          }
        }
        const editBtn = '<button class="btn btn-ghost btn-sm" data-edit-open="' + esc(String(u.id)) + '">' + TR("ویرایش", "Edit") + "</button>";
        tr.innerHTML =
          "<td>" + userCell + "</td>" +
          '<td><span class="badge badge-clay">' + esc(planFa) + "</span></td>" +
          "<td>" + enabledBadge + "</td>" +
          "<td>" + faNum(u.key_count || 0) + "</td>" +
          "<td>" + usageCell + "</td>" +
          "<td>" + subCell + "</td>" +
          "<td>" + esc(quotaTxt) + "</td>" +
          "<td>" + esc(dateStr) + "</td>" +
          "<td>" + editBtn + "</td>";
        tbody.appendChild(tr);
      });

      // open unified edit-user modal
      qa("[data-edit-open]", tbody).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-edit-open");
          const u = users.find((x) => String(x.id) === String(id));
          if (u) openEditUser(u);
        });
      });
    } catch (e) {
      console.error("admin users", e);
      const tbody = q("[data-admin-users-body]");
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#DC2626;padding:1rem">' + esc(e.message || "خطای غیرمنتظره") + "</td></tr>";
    }
  }

  // Loader: admin-stats
  async function loadAdminStats() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      const stats = await api("/api/admin/stats");
      STATE.adminStats = stats;
      const t = stats.totals || {};
      setText("[data-st-users]", faNum(t.users || 0));
      setText("[data-st-keys]", faNum(t.keys || 0));
      setText("[data-st-active]", faNum(t.active_keys || 0));
      setText("[data-st-req]", faNum(t.requests_today || 0));
      setText("[data-st-tok]", fmtTok(t.tokens_today || 0));
      setText("[data-st-failed]", faNum(t.failed_today || 0));

      // generic kpis
      qa("[data-kpi-admin-users]").forEach((el) => (el.textContent = faNum(t.users || 0)));
      qa("[data-kpi-admin-keys]").forEach((el) => (el.textContent = faNum(t.keys || 0)));
      qa("[data-kpi-admin-req]").forEach((el) => (el.textContent = faNum(t.requests_today || 0)));
      qa("[data-kpi-admin-tok]").forEach((el) => (el.textContent = fmtTok(t.tokens_today || 0)));

      const byDay = stats.by_day || [];
      const chart = q("[data-admin-chart]") || q("#admin-chart") || q("[data-admin-stats-chart]");
      if (chart) renderChart(chart, byDay);
      const recentWrap = q("[data-admin-recent-wrap]");
      const topWrap = q("[data-admin-top-wrap]");
      if (stats.recent === undefined && recentWrap) recentWrap.hidden = true;
      if (stats.top_users === undefined && topWrap) topWrap.hidden = true;
      const recentBody = q("[data-admin-recent-body]");
      if (recentBody) {
        recentBody.innerHTML = "";
        const recent = stats.recent || [];
        if (!recent.length) {
          recentBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#8A8475">' + TR("فعالیتی ثبت نشده", "No activity") + '</td></tr>';
        } else {
          recent.forEach((r) => {
            const tr = document.createElement("tr");
            let timeStr = "—";
            try {
              const d = new Date(r.ts);
              timeStr = esc(d.toLocaleDateString(LOC())) + " " + esc(d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" }));
            } catch {}
            const user = r.user_display ? '<span dir="ltr">' + esc(r.user_display) + '</span>' : '—';
            const model = r.model ? '<span dir="ltr" style="font-family:var(--font-mono);font-size:.75rem">' + esc(r.model) + '</span>' : '—';
            const isOk = Number(r.status) < 400;
            const badge = isOk ? '<span class="badge badge-ok">' + esc(String(r.status)) + '</span>' : '<span class="badge badge-bad">' + esc(String(r.status)) + '</span>';
            const hint = !isOk && r.error_code ? '<div style="font-size:.75rem;color:#DC2626;margin-top:2px">' + esc(r.error_code) + '</div>' : '';
            const tok = faNum((Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0)) + ' ' + TR("توکن", "tokens");
            tr.innerHTML = '<td>' + timeStr + '</td><td>' + user + '</td><td>' + model + '</td><td>' + badge + hint + '</td><td dir="ltr">' + esc(tok) + '</td>';
            recentBody.appendChild(tr);
          });
        }
      }
      const topBody = q("[data-admin-top-body]");
      if (topBody) {
        topBody.innerHTML = "";
        const top = stats.top_users || [];
        if (!top.length) {
          topBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1rem;color:#8A8475">' + TR("فعالیتی ثبت نشده", "No activity") + '</td></tr>';
        } else {
          top.forEach((u) => {
            const tr = document.createElement("tr");
            const user = u.user_display ? '<span dir="ltr">' + esc(u.user_display) + '</span>' : '—';
            tr.innerHTML = '<td>' + user + '</td><td>' + faNum(u.requests || 0) + '</td><td dir="ltr">' + faNum(u.tokens || 0) + ' ' + TR("توکن", "tokens") + '</td>';
            topBody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.error("admin stats", e);
    }
  }

  function fillUpstreamSelects() {
    const list = STATE.upkeys || [];
    qa("[data-u-upstream],[data-edit-upstream]").forEach((sel) => {
      const cur = sel.value;
      sel.innerHTML = '<option value="">' + TR("پیش‌فرض (استخر مشترک)", "Default (shared pool)") + "</option>" +
        list.map((k) => '<option value="' + esc(String(k.id)) + '">' + esc(k.label || k.key_masked) + (k.enabled ? "" : " (" + TR("غیرفعال", "disabled") + ")") + "</option>").join("");
      if (cur && list.some((k) => String(k.id) === String(cur))) sel.value = cur; else sel.value = "";
    });
  }

  async function loadAdminUpkeys() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      const keys = await api("/api/admin/upstream-keys");
      STATE.upkeys = keys;
      const tbody = q("[data-uk-body]");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!keys.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1rem;color:#8A8475">' + TR("کلیدی ثبت نشده است", "No upstream keys yet") + "</td></tr>";
        fillUpstreamSelects();
        return;
      }
      keys.forEach((k) => {
        const tr = document.createElement("tr");
        const enBadge = k.enabled ? '<span class="badge badge-ok">' + TR("فعال", "Active") + '</span>' : '<span class="badge badge-bad">' + TR("غیرفعال", "Disabled") + "</span>";
        const defBadge = k.is_default ? '<span class="badge badge-ok">' + TR("پیش‌فرض", "Default") + "</span>" : "";
        const defBtn = k.is_default ? "" : '<button class="btn btn-ghost btn-sm" data-uk-default="' + esc(String(k.id)) + '">' + TR("تنظیم پیش‌فرض", "Make default") + "</button>";
        const toggleBtn = '<button class="btn btn-ghost btn-sm" data-uk-toggle="' + esc(String(k.id)) + '">' + (k.enabled ? TR("غیرفعال", "Disable") : TR("فعال", "Enable")) + "</button>";
        const testBtn = '<button class="btn btn-ghost btn-sm" data-uk-test="' + esc(String(k.id)) + '">' + TR("تست", "Test") + "</button>";
        const delBtn = '<button class="btn btn-ghost btn-sm" style="color:#DC2626" data-uk-del="' + esc(String(k.id)) + '">' + TR("حذف", "Delete") + "</button>";
        tr.innerHTML =
          "<td>" + esc(k.label || "—") + "</td>" +
          '<td dir="ltr">' + esc(k.key_masked || "—") + "</td>" +
          '<td dir="ltr" style="font-family:var(--font-mono);font-size:.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k.base_url || TR("پیش‌فرض", "Default")) + "</td>" +
          "<td>" + enBadge + "</td>" +
          "<td>" + (defBadge || "—") + "</td>" +
          "<td>" + faNum(k.assigned_users || 0) + "</td>" +
          "<td>" + defBtn + " " + toggleBtn + " " + testBtn + " " + delBtn + "</td>";
        tbody.appendChild(tr);
      });
      qa("[data-uk-default]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-uk-default");
          try {
            await api("/api/admin/upstream-keys/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ is_default: true }) });
            showToast(TR("این کلید پیش‌فرض همه کاربران شد", "This key is now the default for all users"), true);
            loadAdminUpkeys();
          } catch (err) {
            showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
          }
        });
      });
      qa("[data-uk-test]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-uk-test");
          btn.disabled = true;
          try {
            const r = await api("/api/admin/upstream-keys/" + encodeURIComponent(id) + "/test", { method: "POST", body: JSON.stringify({}) });
            const ok = r && (r.ok === true || (r.status >= 200 && r.status < 300));
            if (ok) showToast(TR("سبز: status " + (r.status || "OK") + " — " + faNum(r.latency_ms || 0) + "ms", "OK: status " + (r.status || "OK") + " — " + (r.latency_ms || 0) + "ms"), true);
            else showToast(TR("ناموفق: status " + ((r && r.status) || 0) + " — " + esc(String((r && r.base) || "")), "Failed: status " + ((r && r.status) || 0) + " — " + esc(String((r && r.base) || ""))), false);
          } catch (err) {
            const msg = String((err && err.message) || "");
            if (/404/.test(msg)) showToast(TR("این قابلیت در بک‌اند قدیمی در دسترس نیست", "Not available on old backend"), false);
            else showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
          } finally { btn.disabled = false; }
        });
      });

      qa("[data-uk-toggle]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-uk-toggle");
          const k = (STATE.upkeys || []).find((x) => String(x.id) === String(id));
          if (!k) return;
          try {
            await api("/api/admin/upstream-keys/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ enabled: !k.enabled }) });
            showToast(TR("ذخیره شد", "Saved"), true);
            loadAdminUpkeys();
          } catch (err) {
            showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
          }
        });
      });
      qa("[data-uk-del]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-uk-del");
          if (!confirm(TR("این کلید حذف شود؟ کاربرانش به استخر مشترک برمی‌گردند.", "Delete this key? Its users will fall back to the shared pool."))) return;
          try {
            await api("/api/admin/upstream-keys/" + encodeURIComponent(id), { method: "DELETE" });
            showToast(TR("حذف شد", "Deleted"), true);
            loadAdminUpkeys();
          } catch (err) {
            showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
          }
        });
      });
      fillUpstreamSelects();
    } catch (e) {
      console.error("upkeys", e);
      const tbody = q("[data-uk-body]");
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#DC2626;padding:1rem">' + esc(e.message || "خطای غیرمنتظره") + "</td></tr>";
    }
  }

  function setupAdminUpkeys() {
    const btn = q("[data-uk-add]");
    if (btn) {
      btn.addEventListener("click", async () => {
        const labelEl = q("[data-uk-label]");
        const keyEl = q("[data-uk-key]");
        const baseEl = q("[data-uk-base]");
        const defEl = q("[data-uk-default-check]");
        const errEl = q("[data-uk-err]");
        if (errEl) errEl.textContent = "";
        const label = labelEl ? labelEl.value.trim() : "";
        const key = keyEl ? keyEl.value.trim() : "";
        const base = baseEl ? baseEl.value.trim() : "";
        if (!label || !key) {
          if (errEl) errEl.textContent = TR("برچسب و کلید را وارد کنید", "Label and key are required");
          return;
        }
        if (base && !/^https:\/\/.+/i.test(base)) {
          if (errEl) errEl.textContent = TR("Base URL باید با https:// شروع شود", "Base URL must start with https://");
          return;
        }

        try {
          await api("/api/admin/upstream-keys", { method: "POST", body: JSON.stringify({ label, key, base_url: base, is_default: !!(defEl && defEl.checked) }) });
          showToast(TR("کلید اضافه شد", "Key added"), true);
          if (labelEl) labelEl.value = "";
          if (keyEl) keyEl.value = "";
          if (baseEl) baseEl.value = "";
          if (defEl) defEl.checked = false;
          loadAdminUpkeys();
        } catch (err) {
          const m = String((err && err.message) || "");
          if (errEl) errEl.textContent = /exists|23505/i.test(m) ? TR("این کلید قبلاً ثبت شده است", "Key already exists") : (m || TR("خطای غیرمنتظره", "Unexpected error"));
        }
      });
    }
    const openCreate = q('[data-open-modal="createUserModal"]');
    if (openCreate) openCreate.addEventListener("click", () => fillUpstreamSelects());
  }

  // C-2: key advanced settings modal
  function setupKeySettings() {
    const save = q("[data-ks-save]");
    if (!save || save.dataset.bound) return;
    save.dataset.bound = "1";
    save.addEventListener("click", async () => {
      const modal = q("#keySettingsModal");
      if (!modal || !modal.dataset.keyId) return;
      const saver = q("[data-ks-saver]");
      const dbg = q("[data-ks-debug]");
      const modelsEl = q("[data-ks-models]");
      let models;
      if (modelsEl) {
        const raw = modelsEl.value.trim();
        if (!raw) models = [];
        else models = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      try {
        const body = { token_saver: saver ? saver.value : "off", debug: dbg ? dbg.checked : false };
        if (models !== undefined) body.models = models;
        await api("/api/keys/" + encodeURIComponent(modal.dataset.keyId), { method: "PATCH", body: JSON.stringify(body) });
        closeModal(modal);
        showToast(TR("ذخیره شد", "Saved"), true);
        loadKeys();
      } catch (err) {
        const m = String((err && err.message) || "");
        if (/409/.test(m)) showToast(TR("نام تکراری یا تداخل", "Conflict — duplicate"), false);
        else if (/400/.test(m)) showToast(TR("درخواست نامعتبر", "Bad request"), false);
        else showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
      }
    });
  }


  // C-2: admin fallback combos
  function comboStepRow(selHtml, modelVal) {
    const div = document.createElement("div");
    div.setAttribute("data-cb-step", "");
    div.style.cssText = "display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center";
    div.innerHTML = '<select class="input" data-step-upstream style="max-width:14rem" aria-label="' + esc(TR("کلید آپ‌استریم", "Upstream key")) + '">' + selHtml + '</select>' +
      '<input class="input" data-step-model dir="ltr" placeholder="model-name" aria-label="' + esc(TR("نام مدل", "Model name")) + '" value="' + esc(modelVal || "") + '">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-step-del aria-label="' + esc(TR("حذف مرحله", "Remove step")) + '">✕</button>';
    return div;
  }


  function upkeyOptions() {
    const list = STATE.upkeys || [];
    return '<option value="">' + TR("پیش‌فرض (استخر اصلی)", "Default (primary pool)") + "</option>" +
      list.map((k) => '<option value="' + esc(String(k.id)) + '">' + esc(k.label || k.key_masked) + (k.enabled ? "" : " (" + TR("غیرفعال", "disabled") + ")") + "</option>").join("");
  }

  function addComboStep(modelVal, upkeyId) {
    const wrap = q("[data-cb-steps]");
    if (!wrap) return;
    const row = comboStepRow(upkeyOptions(), modelVal);
    wrap.appendChild(row);
    if (upkeyId) {
      const sel = row.querySelector("[data-step-upstream]");
      if (sel) sel.value = String(upkeyId);
    }
    const del = row.querySelector("[data-step-del]");
    if (del) del.addEventListener("click", () => row.remove());
  }

  async function ensureUpkeys() {
    if (!STATE.upkeys || !STATE.upkeys.length) {
      try { STATE.upkeys = await api("/api/admin/upstream-keys"); } catch {}
    }
  }

  // ---------- admin event ----------
  function evLocalInputValue(iso) {
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "";
      const p = (n) => (n < 10 ? "0" + n : String(n));
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
    } catch (_) { return ""; }
  }
  async function loadAdminEvent() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    const msg = q("[data-ev-msg]");
    try {
      const ev = await api("/api/admin/event");
      const EV_STATUS = { scheduled: TR("به‌زودی شروع می‌شود", "Starts soon"), live: TR("زنده", "Live now"), ended: TR("پایان یافت", "Ended"), disabled: TR("غیرفعال", "Disabled") };
      setText("[data-ev-status-text]", ev && ev.status ? (EV_STATUS[ev.status] || ev.status) : "—");
      setText("[data-ev-spent]", faNum((Number(ev && ev.pool_spent) || 0).toLocaleString("en-US")));
      setText("[data-ev-total]", faNum((Number(ev && ev.pool_total) || 0).toLocaleString("en-US")));
      setText("[data-ev-spent-ours]", faNum((Number(ev && ev.pool_spent_ours) || 0).toLocaleString("en-US")));
      setText("[data-ev-spent-other]", faNum((Number(ev && ev.pool_spent_other) || 0).toLocaleString("en-US")));
      const apx = ev && ev.mirror && typeof ev.mirror === "object" ? ev.mirror : null;

      const apFmt = (v) => (Number.isFinite(Number(v)) ? faNum(Number(v).toLocaleString("en-US")) : "—");
      setText("[data-ev-mirror-used]", apx ? apFmt(apx.used) : "—");
      setText("[data-ev-mirror-remaining]", apx ? apFmt(apx.remaining) : "—");
      setText("[data-ev-mirror-part]", apx ? apFmt(apx.participants) : "—");
      setText("[data-ev-mirror-req]", apx ? apFmt(apx.requests) : "—");


      if (ev && ev.event) {
        const m = q("[data-ev-model]"); if (m) m.value = ev.event.model || "";
        const u = q("[data-ev-upstream]"); if (u) u.value = ev.event.upstream_model || "";
        const p = q("[data-ev-pool]"); if (p) p.value = String(ev.event.pool_total || "");
        const o = q("[data-ev-opens]"); if (o) o.value = evLocalInputValue(ev.event.opens_at);
        const e = q("[data-ev-enabled]"); if (e) e.checked = !!ev.event.enabled;
        const ys = q("[data-ev-mirrorsync]"); if (ys) ys.checked = ev.event.mirror_sync !== false;

      } else if (msg) {
        msg.textContent = TR("ایونت پیکربندی نشده است", "Event is not configured");
      }
    } catch (e) {
      if (msg) msg.textContent = (e && e.code && HINTS[e.code]) || (e && e.message) || TR("خطا در دریافت وضعیت ایونت", "Failed to load event status");
    }
  }
  async function saveAdminEvent() {
    const msg = q("[data-ev-msg]");
    const payload = {};
    const m = q("[data-ev-model]"); if (m && m.value.trim()) payload.model = m.value.trim();
    const u = q("[data-ev-upstream]"); if (u && u.value.trim()) payload.upstream_model = u.value.trim();
    const p = q("[data-ev-pool]");
    if (p && String(p.value).trim() !== "") {
      const v = Number(p.value);
      if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
        if (msg) msg.textContent = TR("سقف استخر باید عدد صحیح مثبت باشد", "Pool limit must be a positive integer");
        return;
      }
      payload.pool_total = v;
    }
    const o = q("[data-ev-opens]");
    if (o && o.value) {
      const t = new Date(o.value).getTime();
      if (!Number.isFinite(t)) {
        if (msg) msg.textContent = TR("زمان شروع نامعتبر است", "Invalid opening time");
        return;
      }
      payload.opens_at = new Date(t).toISOString();
    }
    const e = q("[data-ev-enabled]"); if (e) payload.enabled = !!e.checked;
    const ys = q("[data-ev-mirrorsync]"); if (ys) payload.mirror_sync = !!ys.checked;

    if (msg) msg.textContent = TR("در حال ذخیره…", "Saving…");
    try {
      await api("/api/admin/event", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (msg) msg.textContent = TR("ذخیره شد", "Saved");
      loadAdminEvent();
    } catch (err) {
      if (msg) msg.textContent = (err && err.message) || TR("خطا در ذخیره", "Save failed");
    }
  }

  async function loadAdminCombos() {
    if (!STATE.me) { try { STATE.me = await api("/api/me"); } catch {} }
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      const combos = await api("/api/admin/combos");
      const tbody = q("[data-combos-body]");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!Array.isArray(combos) || !combos.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#8A8475">' + TR("هنوز زنجیره‌ای نساخته‌اید", "No combos yet") + "</td></tr>";
        return;
      }
      combos.forEach((c) => {
        const tr = document.createElement("tr");
        const stepsTxt = (Array.isArray(c.steps) ? c.steps : []).map((s) => (s && s.model) || "").filter(Boolean).join(" → ") || "—";
        const defBadge = c.is_default ? '<span class="badge badge-ok">' + TR("زنجیره پیش‌فرض", "Default chain") + "</span>" : '<span style="color:#8A8475">—</span>';
        const enBadge = c.enabled ? '<span class="badge badge-ok">' + TR("فعال", "Active") + '</span>' : '<span class="badge badge-bad">' + TR("غیرفعال", "Disabled") + "</span>";
        tr.innerHTML =
          '<td dir="ltr" style="font-family:var(--font-mono);font-size:.8125rem">' + esc(c.name || "") + "</td>" +
          '<td dir="ltr" style="font-family:var(--font-mono);font-size:.75rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(stepsTxt) + "</td>" +
          "<td>" + defBadge + "</td>" +
          "<td>" + enBadge + "</td>" +
          '<td><button class="btn btn-ghost btn-sm" data-edit-combo="' + esc(String(c.id)) + '">' + TR("ویرایش", "Edit") + '</button> <button class="btn btn-ghost btn-sm" style="color:#DC2626" data-del-combo="' + esc(String(c.id)) + '">' + TR("حذف", "Delete") + "</button></td>";
        tbody.appendChild(tr);
      });
      qa("[data-del-combo]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-del-combo");
          if (!confirm(TR("این زنجیره حذف شود؟", "Delete this combo?"))) return;
          try {
            await api("/api/admin/combos/" + encodeURIComponent(id), { method: "DELETE" });
            showToast(TR("حذف شد", "Deleted"), true);
            loadAdminCombos();
          } catch (err) {
            showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
          }
        });
      });
      qa("[data-edit-combo]", tbody).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-edit-combo");
          try {
            const list = (await api("/api/admin/combos")) || [];
            const c = list.find((x) => String(x.id) === String(id));
            if (!c) return;
            await ensureUpkeys();
            fillComboModal(c);
            openModal("comboModal");
          } catch (err) {
            showToast((err && err.message) || TR("خطای غیرمنتظره", "Unexpected error"), false);
          }
        });
      });
    } catch (e) {
      const msg = String((e && e.message) || "");
      const tbody2 = q("[data-combos-body]");
      if (tbody2 && /404/.test(msg)) tbody2.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#8A8475">' + TR("این قابلیت در بک‌اند قدیمی فعال نیست", "Not available on old backend") + "</td></tr>";
      console.error("combos", e);
    }

  }

  function fillComboModal(c) {
    const modal = q("#comboModal");
    if (!modal) return;
    modal.dataset.comboId = c && c.id ? String(c.id) : "";
    const nameEl = q("[data-cb-name]");
    if (nameEl) nameEl.value = (c && c.name) || "";
    const defEl = q("[data-cb-default]");
    if (defEl) defEl.checked = !!(c && c.is_default);
    const enEl = q("[data-cb-enabled]");
    if (enEl) enEl.checked = c ? !!c.enabled : true;
    const wrap = q("[data-cb-steps]");
    if (wrap) wrap.innerHTML = "";
    const steps = c && Array.isArray(c.steps) ? c.steps : [];
    if (steps.length) steps.forEach((s) => addComboStep((s && s.model) || "", (s && s.upstream_key_id) || ""));
    else addComboStep("", "");
  }

  async function setupAdminCombos() {
    const addBtn = q("[data-cb-add]");
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => { addComboStep("", ""); });
    }
    const save = q("[data-cb-save]");
    if (save && !save.dataset.bound) {
      save.dataset.bound = "1";
      save.addEventListener("click", async () => {
        const modal = q("#comboModal");
        if (!modal) return;
        const nameEl = q("[data-cb-name]");
        const name = nameEl ? nameEl.value.trim().toLowerCase() : "";
        if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(name)) {
          showToast(TR("نام نامعتبر است (انگلیسی، بدون فاصله)", "Invalid name (latin, no spaces)"), false);
          return;
        }
        const steps = [];
        let bad = false;
        qa("[data-cb-step]").forEach((row) => {
          const sel = row.querySelector("[data-step-upstream]");
          const inp = row.querySelector("[data-step-model]");
          const model = inp ? inp.value.trim() : "";
          if (!model) { bad = true; return; }
          steps.push({ upstream_key_id: sel && sel.value ? sel.value : null, model });
        });
        if (bad || !steps.length) {
          showToast(TR("مدل هر مرحله را وارد کنید", "Enter a model for every step"), false);
          return;
        }
        const defEl = q("[data-cb-default]");
        const enEl = q("[data-cb-enabled]");
        const body = { name, steps, is_default: defEl ? defEl.checked : false, enabled: enEl ? enEl.checked : true };
        try {
          if (modal.dataset.comboId) await api("/api/admin/combos/" + encodeURIComponent(modal.dataset.comboId), { method: "PATCH", body: JSON.stringify(body) });
          else await api("/api/admin/combos", { method: "POST", body: JSON.stringify(body) });
          closeModal(modal);
          showToast(TR("ذخیره شد", "Saved"), true);
          loadAdminCombos();
        } catch (err) {
          showToast(err.message || TR("خطای غیرمنتظره", "Unexpected error"), false);
        }
      });
    }
    const openBtn = q('[data-open-modal="comboModal"]');
    if (openBtn && !openBtn.dataset.bound) {
      openBtn.dataset.bound = "1";
      openBtn.addEventListener("click", async (ev) => {
        if (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); }
        await ensureUpkeys();
        fillComboModal(null);
        openModal("comboModal");
      });
    }

  }

  // Create user form
  function setupAdminCreateUser() {
    const form = q("[data-create-user]") || q("#createUserForm");
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]') || q("[data-create-user-submit]");
    const handler = async (e) => {
      if (e) e.preventDefault();
      const email = ((q("[data-u-email]") || {}).value || "").trim();
      const username = ((q("[data-u-username]") || {}).value || "").trim();
      const name = (q("[data-u-name]") || {}).value || "";
      const password = (q("[data-u-pass]") || {}).value || "";
      const plan = (q("[data-u-plan]") || {}).value || "starter";
      const subMonths = (q("[data-u-sub]") || {}).value || "";
      const upstreamValue = (q("[data-u-upstream]") || {}).value || "";
      if (!password) {
        showToast(TR("رمز عبور الزامی است", "Password is required"), false);
        return;
      }
      if (!email && !username) {
        showToast(TR("ایمیل یا نام کاربری (حداقل یکی) لازم است", "Email or username (at least one) is required"), false);
        return;
      }
      const payload = { name, password, plan, subscription_expires_at: null, upstream_key_id: upstreamValue || null };
      if (email) payload.email = email;
      if (username) payload.username = username;
      if (subMonths) {
        const d = new Date();
        d.setMonth(d.getMonth() + Number(subMonths));
        payload.subscription_expires_at = d.toISOString();
      }
      try {
        await api("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
        showToast(TR("کاربر ساخته شد", "User created"), true);
        closeAllModals();
        if (q("[data-u-email]")) q("[data-u-email]").value = "";
        if (q("[data-u-username]")) q("[data-u-username]").value = "";
        if (q("[data-u-name]")) q("[data-u-name]").value = "";
        if (q("[data-u-pass]")) q("[data-u-pass]").value = "";
        if (q("[data-u-sub]")) q("[data-u-sub]").value = "";
        if (q("[data-u-upstream]")) q("[data-u-upstream]").value = "";
        loadAdminUsers();
      } catch (err) {
        const msg = err.message || "";
        if (/username/i.test(msg)) showToast(TR("نام کاربری تکراری است", "Username already exists"), false);
        else if (/email/i.test(msg)) showToast(TR("ایمیل تکراری است", "Email already exists"), false);
        else showToast(msg || "خطای غیرمنتظره", false);
      }
    };
    if (form.tagName.toLowerCase() === "form") form.addEventListener("submit", handler);
    else if (btn) btn.addEventListener("click", handler);
    else form.addEventListener("click", handler);
  }


  // Keys create modal
  function setupKeysCreate() {
    const btn = q("[data-create-key]") || q("#createKeyBtn");
    const form = q("[data-create-key-form]") || q("#createKeyForm");
    const labelInput = q("[data-key-label]") || q('input[name="label"]') || q("#keyLabel");
    const modelsSel = q("[data-key-models]");
    const trigger = btn || (form ? form.querySelector('button[type="submit"]') : null);
    const handler = async (e) => {
      if (e) e.preventDefault();
      const label = labelInput ? labelInput.value.trim() : "";
      let modelsVal = "*";
      if (modelsSel) {
        const selected = Array.from(modelsSel.selectedOptions || []).map((o) => o.value);
        // also handle if it's a text input
        if (selected.length) modelsVal = selected.join(",");
        else if (modelsSel.value) modelsVal = modelsSel.value;
        else modelsVal = "*";
      }
      const payload = { label: label || undefined, models: modelsVal };
      const submitBtn = trigger;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = TR("در حال ساخت…", "Creating…");
      }
      try {
        const res = await api("/api/keys", { method: "POST", body: JSON.stringify(payload) });
        // close create modal
        closeAllModals();
        // reveal
        const reveal = q("#revealKeyModal") || q("[data-reveal-modal]") || q("[data-modal='revealKeyModal']");
        const newKeyEl = q("[data-new-key]");
        if (newKeyEl) {
          newKeyEl.textContent = res.key || res.id || "";
          newKeyEl.setAttribute("dir", "ltr");
        }
        if (reveal) {
          reveal.classList.remove("hidden");
          reveal.removeAttribute("hidden");
          reveal.style.display = "";
          // copy button inside reveal
          const copyBtn = reveal.querySelector("[data-copy-new-key]") || reveal.querySelector("[data-copy]");
          if (copyBtn) {
            copyBtn.onclick = () => copyText(res.key || "").then(() => showToast(TR("کپی شد", "Copied"), true));
          }
          // on close reload
          const closeBtns = reveal.querySelectorAll("[data-close-modal]");
          closeBtns.forEach((b) => {
            b.addEventListener("click", () => {
              closeModal(b);
              loadKeys();
              loadOverview();
            });
          });
        } else {
          // fallback prompt
          prompt("کلید شما (یک بار نمایش):", res.key || "");
          loadKeys();
        }
        if (labelInput) labelInput.value = "";
      } catch (err) {
        showToast(err.message || "خطای غیرمنتظره", false);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = TR("ساخت کلید", "Create key");
        }
      }
    };
    if (form) form.addEventListener("submit", handler);
    if (btn && btn !== form) btn.addEventListener("click", handler);
  }

  // Modal open/close wiring
  function setupModals() {
    qa("[data-open-modal]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const id = el.getAttribute("data-open-modal");
        if (id) openModal(id);
      });
    });
    qa("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        closeModal(el);
        // if reveal modal closed, reload keys
        const back = el.closest(".modal-back");
        if (back && (back.id === "revealKeyModal" || back.querySelector("[data-new-key]"))) {
          loadKeys();
          loadOverview();
        }
      });
    });
    qa(".modal-back").forEach((back) => {
      back.addEventListener("click", (e) => {
        if (e.target === back) {
          closeModal(back);
          if (back.id === "revealKeyModal" || back.querySelector("[data-new-key]")) {
            loadKeys();
            loadOverview();
          }
        }
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  }

  // Register loaders
  VIEW_LOADERS.overview = loadOverview;
  VIEW_LOADERS.keys = loadKeys;
  VIEW_LOADERS.usage = loadUsage;
  VIEW_LOADERS.settings = loadSettings;
  VIEW_LOADERS["admin-users"] = loadAdminUsers;
  VIEW_LOADERS["admin-stats"] = loadAdminStats;
  VIEW_LOADERS["admin-upkeys"] = loadAdminUpkeys;
  VIEW_LOADERS["admin-combos"] = loadAdminCombos;
  VIEW_LOADERS["admin-event"] = loadAdminEvent;
  try {
    const evSave = q("[data-ev-save]");
    if (evSave) evSave.addEventListener("click", saveAdminEvent);
  } catch (_) {}
  VIEW_LOADERS.admin = loadAdminUsers;

  // Boot
  async function boot() {
    setupModals();
    setupTabs();
    setupPasswordForm();
    setupKeysCreate();
    setupAdminCreateUser();
  setupProfileForm();
  setupAdminUpkeys();
  setupKeySettings();
  setupAdminCombos();

    setupEditUser();

    try {
      const me = await api("/api/me");
      STATE.me = me;
      setupHeader();
      updateAdminVisibility();
    } catch (e) {
      // 401 already handled
      console.error(e);
      return;
    }

    // honor hash
    const initial = location.hash ? location.hash.replace(/^#/, "") : "overview";
    // ensure valid view
    const validViews = ["overview", "keys", "usage", "settings", "admin-users", "admin-stats", "admin-upkeys", "admin-combos", "admin-event"];
    const toShow = validViews.includes(initial) ? initial : "overview";
    switchView(toShow, false);
    // if hash was empty, set it
    if (!location.hash) history.replaceState(null, "", "#" + toShow);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
