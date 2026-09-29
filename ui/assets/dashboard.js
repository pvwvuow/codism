(() => {
  "use strict";
  const API_BASE = (typeof window !== "undefined" && window.CODISM_API_BASE) || "";
  const T = () => localStorage.getItem("codism_token");
  const H = () => ({ Authorization: "Bearer " + T(), "Content-Type": "application/json" });

  if (!T()) {
    location.replace("login.html");
    return;
  }

  const STATE = { me: null, usage: null, keys: [], models: [], adminStats: null };

  const PLAN_FA = {
    free: "رایگان",
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
      return v.toLocaleString("fa-IR");
    } catch {
      return String(v);
    }
  }

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
        copyText(baseUrl).then(() => showToast("کپی شد", true));
      });
    });
    // logout transform
    const authCtas = qa("a[data-auth-cta], a[data-auth-link]");
    authCtas.forEach((a) => {
      a.textContent = "خروج";
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
      const [meRes, keysRes, usageRes] = await Promise.all([
        api("/api/me"),
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
      const planKey = (me.user && me.user.plan) || "free";
      const planFa = PLAN_FA[planKey] || PLAN_FA.free;
      setText("[data-plan-name]", planFa);
      setText("[data-plan-name2]", planFa);
      const monthTok = (Number(month.prompt_tokens) || 0) + (Number(month.completion_tokens) || 0);
      const todayTok = (Number(today.prompt_tokens) || 0) + (Number(today.completion_tokens) || 0);
      setText("[data-kpi-month-tok]", fmtTok(monthTok));
      setText("[data-kpi-today-req]", faNum(today.requests || 0));
      setText("[data-kpi-today-tok]", fmtTok(todayTok));
      const enabledCount = keys.filter((k) => k.enabled).length;
      setText("[data-plan-keys]", faNum(enabledCount));
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
              dateStr = d.toLocaleDateString("fa-IR") + ' <small dir="ltr" style="color:#8A8475">' + esc(d.toLocaleTimeString("fa-IR")) + "</small>";
            } catch {}
            tr.innerHTML =
              '<td>' + label + "</td>" +
              '<td><code class="kbd" dir="ltr">' + masked + '</code> <button class="btn btn-ghost btn-sm" data-copy-key="' + esc(keyVal) + '">کپی</button></td>' +
              "<td>" + enabledBadge + "</td>" +
              "<td>" + modelsCell + "</td>" +
              '<td dir="ltr">' + dateStr + "</td>" +
              '<td><button class="btn btn-ghost btn-sm" data-del-key="' + esc(String(k.id)) + '">حذف</button></td>';
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
      const avg = byDay.length ? Math.round(byDay.reduce((a, r) => a + (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0), 0) / 14) : 0;
      const failed = recent.filter((r) => Number(r.status) >= 400).length;

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
              timeStr = d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
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
      qa("[data-export]").forEach((el) => {
        const fmt = el.getAttribute("data-export") || el.getAttribute("data-format") || "csv";
        const href = API_BASE + "/api/usage/export?format=" + encodeURIComponent(fmt) + "&days=90";
        if (el.tagName.toLowerCase() === "a") {
          el.setAttribute("href", href);
          el.setAttribute("download", "");
        } else {
          el.addEventListener("click", (e) => {
            e.preventDefault();
            const a = document.createElement("a");
            a.href = href;
            a.setAttribute("download", "");
            // need auth header for fetch? but export is via browser fetch with token? Use fetch blob
            // fallback: open with token via fetch
            fetch(href, { headers: H() })
              .then((res) => {
                if (!res.ok) throw new Error("خطای غیرمنتظره");
                return res.blob();
              })
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.download = "usage-" + fmt + ".zip";
                if (fmt === "csv") a.download = "usage.csv";
                if (fmt === "json") a.download = "usage.json";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  a.remove();
                }, 1000);
              })
              .catch((err) => showToast(err.message || "خطای غیرمنتظره", false));
          });
        }
      });
      // also handle generic export links
      qa("a[data-export-csv], a[data-export-json]").forEach((a) => {
        const fmt = a.hasAttribute("data-export-csv") ? "csv" : "json";
        a.href = API_BASE + "/api/usage/export?format=" + fmt + "&days=90";
        a.setAttribute("download", "");
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
      setText("[data-set-email]", u.email || "—");
      setText("[data-set-name]", u.name || "—");
      const planFa = PLAN_FA[u.plan || "free"] || PLAN_FA.free;
      setText("[data-set-plan]", planFa);
      const quota = u.monthly_quota_tokens;
      setText("[data-set-quota]", quota == null || quota === 0 ? "نامحدود" : fmtTok(quota) + " توکن");
      let since = "—";
      try {
        if (u.created_at) since = new Date(u.created_at).toLocaleDateString("fa-IR");
      } catch {}
      setText("[data-set-since]", since);
      // also fill inputs if exist
      const emailInput = q("[data-set-email-input]");
      if (emailInput) emailInput.value = u.email || "";
      const nameInput = q("[data-set-name-input]");
      if (nameInput) nameInput.value = u.name || "";
    } catch (e) {
      console.error("settings", e);
    }
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
  async function loadAdminUsers() {
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      const users = await api("/api/admin/users");
      const tbody = q("[data-admin-users-body]");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1rem;color:#8A8475">کاربری یافت نشد</td></tr>';
        return;
      }
      users.forEach((u) => {
        const tr = document.createElement("tr");
        const planFa = PLAN_FA[u.plan || "free"] || esc(u.plan || "free");
        const enabledBadge = u.enabled ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-bad">غیرفعال</span>';
        const quotaTxt = u.monthly_quota_tokens == null || u.monthly_quota_tokens === 0 ? "نامحدود" : fmtTok(u.monthly_quota_tokens);
        let dateStr = "—";
        try {
          dateStr = new Date(u.created_at).toLocaleDateString("fa-IR");
        } catch {}
        const userCell =
          '<div style="font-weight:600">' + esc(u.name || "—") + '</div><div dir="ltr" style="font-size:.75rem;color:#6B6659">' + esc(u.email || "") + "</div>";
        const menu =
          '<div class="menu" style="position:relative;display:inline-block">' +
          '<button class="btn btn-ghost btn-sm" data-menu-toggle>⋯</button>' +
          '<div class="menu-list hidden" style="position:absolute;left:0;top:100%;background:#fff;border:1px solid #E8E2D5;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08);min-width:160px;z-index:10;padding:.25rem 0">' +
          '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:start" data-act="toggle" data-id="' + esc(String(u.id)) + '" data-enabled="' + (u.enabled ? "1" : "0") + '">' + (u.enabled ? "غیرفعال کردن" : "فعال کردن") + "</button>" +
          '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:start" data-act="plan" data-id="' + esc(String(u.id)) + '">تغییر پلن</button>' +
          '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:start" data-act="quota" data-id="' + esc(String(u.id)) + '">ویرایش سهمیه</button>' +
          '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:start" data-act="reset" data-id="' + esc(String(u.id)) + '">ریست رمز</button>' +
          '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:start;color:#DC2626" data-act="delete" data-id="' + esc(String(u.id)) + '">حذف</button>' +
          "</div></div>";
        tr.innerHTML =
          "<td>" + userCell + "</td>" +
          '<td><span class="badge badge-clay">' + esc(planFa) + "</span></td>" +
          "<td>" + enabledBadge + "</td>" +
          "<td>" + faNum(u.key_count || 0) + "</td>" +
          "<td>" + esc(quotaTxt) + "</td>" +
          "<td>" + esc(dateStr) + "</td>" +
          "<td>" + menu + "</td>";
        tbody.appendChild(tr);
      });

      // menu toggle logic
      qa("[data-menu-toggle]", tbody).forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const list = btn.nextElementSibling;
          const isHidden = list.classList.contains("hidden");
          // close all
          qa(".menu-list", tbody).forEach((l) => {
            l.classList.add("hidden");
            l.style.display = "none";
          });
          if (isHidden) {
            list.classList.remove("hidden");
            list.style.display = "block";
          }
        });
      });
      document.addEventListener("click", () => {
        qa(".menu-list", tbody).forEach((l) => {
          l.classList.add("hidden");
          l.style.display = "none";
        });
      });

      // actions
      qa('[data-act="toggle"]', tbody).forEach((b) => {
        b.addEventListener("click", async () => {
          const id = b.getAttribute("data-id");
          const enabled = b.getAttribute("data-enabled") === "1";
          try {
            await api("/api/admin/users/" + encodeURIComponent(id), {
              method: "PATCH",
              body: JSON.stringify({ enabled: !enabled }),
            });
            showToast("وضعیت تغییر کرد", true);
            loadAdminUsers();
          } catch (e) {
            showToast(e.message || "خطای غیرمنتظره", false);
          }
        });
      });
      qa('[data-act="plan"]', tbody).forEach((b) => {
        b.addEventListener("click", () => {
          const id = b.getAttribute("data-id");
          adminSelectedUser = id;
          const modal = q("#planModal") || q("[data-modal='planModal']") || q("[data-plan-modal]");
          if (modal) {
            openModal(modal.id || "planModal");
          } else {
            const sel = prompt("پلن جدید (free, starter, basic, pro, scale, unlimited):", "pro");
            if (sel) {
              api("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ plan: sel }) })
                .then(() => {
                  showToast("پلن تغییر کرد", true);
                  loadAdminUsers();
                })
                .catch((e) => showToast(e.message || "خطای غیرمنتظره", false));
            }
          }
        });
      });
      qa('[data-act="quota"]', tbody).forEach((b) => {
        b.addEventListener("click", () => {
          const id = b.getAttribute("data-id");
          adminSelectedUser = id;
          const modal = q("#quotaModal") || q("[data-modal='quotaModal']") || q("[data-quota-modal]");
          if (modal) {
            // prefill
            const u = users.find((x) => String(x.id) === String(id));
            const mInput = modal.querySelector('[data-quota-monthly]') || modal.querySelector('input[name="monthly_quota_tokens"]');
            const dInput = modal.querySelector('[data-quota-daily]') || modal.querySelector('input[name="daily_quota_tokens"]');
            if (mInput) mInput.value = u && u.monthly_quota_tokens ? String(u.monthly_quota_tokens) : "";
            if (dInput) dInput.value = u && u.daily_quota_tokens != null ? String(u.daily_quota_tokens) : "";
            openModal(modal.id || "quotaModal");
          } else {
            const val = prompt("سهمیه ماهانه (عدد یا خالی برای نامحدود):", "");
            if (val !== null) {
              const payload = { monthly_quota_tokens: val === "" ? 0 : Number(val) };
              api("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(payload) })
                .then(() => {
                  showToast("سهمیه ویرایش شد", true);
                  loadAdminUsers();
                })
                .catch((e) => showToast(e.message || "خطای غیرمنتظره", false));
            }
          }
        });
      });
      qa('[data-act="reset"]', tbody).forEach((b) => {
        b.addEventListener("click", () => {
          const id = b.getAttribute("data-id");
          adminSelectedUser = id;
          const modal = q("#resetPwModal") || q("[data-modal='resetPwModal']") || q("[data-reset-modal]");
          if (modal) openModal(modal.id || "resetPwModal");
          else {
            const pw = prompt("رمز جدید (حداقل ۸ کاراکتر):", "");
            if (pw) {
              api("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ password: pw }) })
                .then(() => showToast("رمز تغییر کرد", true))
                .catch((e) => showToast(e.message || "خطای غیرمنتظره", false));
            }
          }
        });
      });
      qa('[data-act="delete"]', tbody).forEach((b) => {
        b.addEventListener("click", async () => {
          const id = b.getAttribute("data-id");
          if (!confirm("کاربر و همه کلیدهایش حذف شود؟")) return;
          try {
            await api("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" });
            showToast("کاربر حذف شد", true);
            loadAdminUsers();
          } catch (e) {
            showToast(e.message || "خطای غیرمنتظره", false);
          }
        });
      });
    } catch (e) {
      console.error("admin users", e);
      const tbody = q("[data-admin-users-body]");
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#DC2626;padding:1rem">' + esc(e.message || "خطای غیرمنتظره") + "</td></tr>";
    }
  }

  // Loader: admin-stats
  async function loadAdminStats() {
    const isAdmin = STATE.me && STATE.me.user && STATE.me.user.role === "admin";
    if (!isAdmin) return;
    try {
      const stats = await api("/api/admin/stats");
      STATE.adminStats = stats;
      const t = stats.totals || {};
      setText("[data-admin-users]", faNum(t.users || 0));
      setText("[data-admin-keys]", faNum(t.keys || 0));
      setText("[data-admin-active-keys]", faNum(t.active_keys || 0));
      setText("[data-admin-requests-today]", faNum(t.requests_today || 0));
      setText("[data-admin-tokens-today]", fmtTok(t.tokens_today || 0));
      setText("[data-admin-failed-today]", faNum(t.failed_today || 0));
      // generic kpis
      qa("[data-kpi-admin-users]").forEach((el) => (el.textContent = faNum(t.users || 0)));
      qa("[data-kpi-admin-keys]").forEach((el) => (el.textContent = faNum(t.keys || 0)));
      qa("[data-kpi-admin-req]").forEach((el) => (el.textContent = faNum(t.requests_today || 0)));
      qa("[data-kpi-admin-tok]").forEach((el) => (el.textContent = fmtTok(t.tokens_today || 0)));

      const byDay = stats.by_day || [];
      const chart = q("[data-admin-chart]") || q("#admin-chart") || q("[data-admin-stats-chart]");
      if (chart) renderChart(chart, byDay);
    } catch (e) {
      console.error("admin stats", e);
    }
  }

  // Create user form
  function setupAdminCreateUser() {
    const form = q("[data-create-user]") || q("#createUserForm");
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]') || q("[data-create-user-submit]");
    const handler = async (e) => {
      if (e) e.preventDefault();
      const email = (q("[data-new-user-email]") || form.querySelector('input[name="email"]') || {}).value || "";
      const name = (q("[data-new-user-name]") || form.querySelector('input[name="name"]') || {}).value || "";
      const password = (q("[data-new-user-password]") || form.querySelector('input[name="password"]') || {}).value || "";
      const plan = (q("[data-new-user-plan]") || form.querySelector('select[name="plan"]') || {}).value || "free";
      if (!email || !password) {
        showToast("ایمیل و رمز الزامی است", false);
        return;
      }
      try {
        await api("/api/admin/users", { method: "POST", body: JSON.stringify({ email, name, password, plan }) });
        showToast("کاربر ساخته شد", true);
        closeAllModals();
        form.reset && form.reset();
        loadAdminUsers();
      } catch (err) {
        if (err.code === "email_exists" || err.status === 409) showToast("ایمیل تکراری است", false);
        else showToast(err.message || "خطای غیرمنتظره", false);
      }
    };
    if (form.tagName.toLowerCase() === "form") form.addEventListener("submit", handler);
    else if (btn) btn.addEventListener("click", handler);
    else form.addEventListener("click", handler);
  }

  function setupAdminModals() {
    // plan save
    const planSave = q("[data-save-plan]") || q("#savePlanBtn");
    if (planSave) {
      planSave.addEventListener("click", async (e) => {
        e.preventDefault();
        const sel = q("[data-plan-select]") || q("#planSelect") || document.querySelector("#planModal select");
        const plan = sel ? sel.value : "free";
        if (!adminSelectedUser) return;
        try {
          await api("/api/admin/users/" + encodeURIComponent(adminSelectedUser), { method: "PATCH", body: JSON.stringify({ plan }) });
          showToast("پلن تغییر کرد", true);
          closeAllModals();
          loadAdminUsers();
        } catch (err) {
          showToast(err.message || "خطای غیرمنتظره", false);
        }
      });
    }
    const quotaSave = q("[data-save-quota]") || q("#saveQuotaBtn");
    if (quotaSave) {
      quotaSave.addEventListener("click", async (e) => {
        e.preventDefault();
        const modal = quotaSave.closest(".modal-back") || document;
        const mInput = modal.querySelector('[data-quota-monthly]') || modal.querySelector('input[name="monthly_quota_tokens"]') || q("[data-quota-monthly]");
        const dInput = modal.querySelector('[data-quota-daily]') || modal.querySelector('input[name="daily_quota_tokens"]') || q("[data-quota-daily]");
        const mVal = mInput ? mInput.value.trim() : "";
        const dVal = dInput ? dInput.value.trim() : "";
        const payload = {};
        payload.monthly_quota_tokens = mVal === "" ? 0 : Number(mVal);
        if (dInput) payload.daily_quota_tokens = dVal === "" ? null : Number(dVal);
        if (!adminSelectedUser) return;
        try {
          await api("/api/admin/users/" + encodeURIComponent(adminSelectedUser), { method: "PATCH", body: JSON.stringify(payload) });
          showToast("سهمیه ویرایش شد", true);
          closeAllModals();
          loadAdminUsers();
        } catch (err) {
          showToast(err.message || "خطای غیرمنتظره", false);
        }
      });
    }
    const resetSave = q("[data-save-reset-pw]") || q("#saveResetPwBtn");
    if (resetSave) {
      resetSave.addEventListener("click", async (e) => {
        e.preventDefault();
        const modal = resetSave.closest(".modal-back") || document;
        const inp = modal.querySelector('[data-reset-password]') || modal.querySelector('input[name="password"]') || q("[data-reset-password]");
        const pw = inp ? inp.value : "";
        if (!pw || pw.length < 8) {
          showToast("حداقل ۸ کاراکتر", false);
          return;
        }
        if (!adminSelectedUser) return;
        try {
          await api("/api/admin/users/" + encodeURIComponent(adminSelectedUser), { method: "PATCH", body: JSON.stringify({ password: pw }) });
          showToast("رمز تغییر کرد", true);
          closeAllModals();
          if (inp) inp.value = "";
        } catch (err) {
          showToast(err.message || "خطای غیرمنتظره", false);
        }
      });
    }
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
        submitBtn.textContent = "در حال ساخت…";
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
            copyBtn.onclick = () => copyText(res.key || "").then(() => showToast("کپی شد", true));
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
          submitBtn.textContent = "ساخت کلید";
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
  VIEW_LOADERS.admin = loadAdminUsers;

  // Boot
  async function boot() {
    setupModals();
    setupTabs();
    setupPasswordForm();
    setupKeysCreate();
    setupAdminCreateUser();
    setupAdminModals();

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
    const validViews = ["overview", "keys", "usage", "settings", "admin-users", "admin-stats"];
    const toShow = validViews.includes(initial) ? initial : "overview";
    switchView(toShow, false);
    // if hash was empty, set it
    if (!location.hash) history.replaceState(null, "", "#" + toShow);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
