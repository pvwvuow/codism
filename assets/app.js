(() => {
  "use strict";

  const API_BASE = (typeof window !== "undefined" && window.CODISM_API_BASE) || "";

  // helpers
  function TR(fa, en) { return (typeof window !== "undefined" && window.I18N && window.I18N.lang === "en") ? en : fa; }
  function faNum(n) {
    try {
      return Number(n).toLocaleString("fa-IR");
    } catch (_) {
      return String(n);
    }
  }
  function fmtTok(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  }
  function fmtCtx(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    if (v >= 1e6) {
      const m = v / 1e6;
      return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + "M";
    }
    const k = v / 1e3;
    return (Number.isInteger(k) ? String(k) : k.toFixed(1)) + "K";
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // provider labels
  const PROVIDERS = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    meta: "Meta",
    moonshot: "Moonshot",
    zhipu: "Zhipu",
    bytedance: "ByteDance",
    mistral: "Mistral",
  };

  function providerLabel(p) {
    return PROVIDERS[p] || "دیگر";
  }

  function descForId(id) {
    const low = String(id).toLowerCase();
    if (low.includes("opus")) return "مدل پرچم‌دار Anthropic؛ استدلال و کدنویسی در بالاترین سطح.";
    if (low.includes("sonnet") || low.includes("haiku")) return "Anthropic؛ تعادل سرعت و کیفیت.";
    if (low.includes("gpt")) return "مدل‌های OpenAI؛ همه‌فن‌حریف و پایدار.";
    if (low.includes("deepseek")) return "DeepSeek؛ کدنویسی قوی با قیمت اقتصادی.";
    if (low.includes("qwen")) return "Alibaba Qwen؛ متن‌باز با عملکرد چشمگیر.";
    if (low.includes("gemma")) return "Google Gemma؛ سبک و مقرون‌به‌صرفه.";
    if (low.includes("gemini")) return "Google Gemini؛ پنجره متنی بزرگ.";
    if (low.includes("glm")) return "Zhipu GLM؛ استدلال و کدنویسی.";
    if (low.includes("kimi")) return "Moonshot Kimi؛ متن‌های طولانی.";
    if (low.includes("seed")) return "ByteDance Seed؛ سریع و ارزان.";
    if (low.includes("llama")) return "Meta Llama؛ متن‌باز محبوب.";
    if (low.includes("mistral")) return "Mistral؛ اروپایی و کارا.";
    return "مدل چت چندمنظوره با پشتیبانی کامل از استریم.";
  }

  // ---------- Event widget (10B free GPT-6; stats mirrored live from apmix.ai) ----------
  const EVENT_QA = (sel) => Array.from(document.querySelectorAll(sel));
  const EVENT_STATUS_FA = { upcoming: "به‌زودی شروع می‌شود", live: "زنده است", ended: "پایان یافت", completed: "پایان یافت" };
  const EVENT_STATUS_EN = { upcoming: "Starts soon", live: "Live now", ended: "Ended", completed: "Ended" };
  let __eventTimer = null;
  function eventFmtTok(n) {
    const v = Number(n) || 0;
    if (v >= 1e9) return (Math.round((v / 1e9) * 100) / 100) + "B";
    if (v >= 1e6) return (Math.round((v / 1e6) * 100) / 100) + "M";
    if (v >= 1e3) return (Math.round((v / 1e3) * 100) / 100) + "K";
    return String(v);
  }
  function eventCountdownStr(target, now) {
    let ms = target - now;
    if (!(ms > 0)) ms = 0;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const p2 = (x) => String(x).padStart(2, "0");
    return p2(d) + "d : " + p2(h) + "h : " + p2(m) + "m : " + p2(s) + "s";
  }
  function renderEvent(ev) {
    const q = (sel) => document.querySelector(sel);
    const qa = EVENT_QA;
    const pool = (ev && ev.pool) || 10000000000;
    const startsAt = ev && ev.starts_at ? Date.parse(ev.starts_at) : NaN;
    const mirror = ev && ev.mirror;
    const used = mirror ? (Number(mirror.used) || 0) : ((ev && ev.ours && Number(ev.ours.tokens)) || 0);
    const remaining = mirror ? (Number(mirror.remaining) || 0) : Math.max(0, pool - used);
    const status = (ev && ev.status) || "upcoming";
    const pct = pool > 0 ? Math.min(100, (used / pool) * 100) : 0;
    const live = status === "live";
    const ended = status === "ended" || status === "completed" || (mirror && Number(mirror.remaining) === 0);
    const statusText = TR(EVENT_STATUS_FA[status] || status, EVENT_STATUS_EN[status] || status);
    qa("[data-event-status-text]").forEach((el) => (el.textContent = statusText));
    qa("[data-event-dot]").forEach((el) => { try { el.setAttribute("data-live", live ? "true" : "false"); if (ended) el.setAttribute("data-ended", "true"); } catch (_) {} });
    const usedTxt = eventFmtTok(used);
    const remTxt = ended ? "0" : eventFmtTok(remaining);
    qa("[data-event-used]").forEach((el) => (el.textContent = usedTxt));
    qa("[data-event-remaining]").forEach((el) => (el.textContent = remTxt));
    qa("[data-event-bar]").forEach((el) => (el.style.width = pct.toFixed(2) + "%"));
    qa("[data-event-pool]").forEach((el) => (el.textContent = eventFmtTok(pool)));
    const pctWrap = q("[data-event-pct-wrap]");
    if (pctWrap) { if (used > 0) { pctWrap.hidden = false; const el = q("[data-event-pct]"); if (el) el.textContent = pct.toFixed(1) + "%"; } }
    const src = q("[data-event-src]");
    if (src) {
      if (mirror) { src.hidden = false; src.textContent = TR("آمار مصرف زنده — همگام با apmix.ai", "Live usage — synced with apmix.ai"); }
      else if (ev) { src.hidden = false; src.textContent = TR("آمار مصرف زنده", "Live usage"); }
    }
    // nav badge status
    qa("[data-event-navbadge]").forEach((el) => { if (ended) el.textContent = TR("پایان یافت", "Ended"); else if (live) el.textContent = TR("زنده است", "Live"); });
    // countdown tick (local so it stays smooth between polls)
    const tick = () => {
      const els = qa("[data-event-countdown]");
      if (!els.length) return;
      let base = Date.now();
      if (mirror && mirror.now) { const skew = Date.parse(mirror.now) - Date.now(); if (Math.abs(skew) < 600000) base += skew; }
      const target = isNaN(startsAt) ? base : startsAt;
      const str = eventCountdownStr(target, base);
      els.forEach((el) => (el.textContent = str));
      const lbl = q("[data-event-countdown-label]");
      if (lbl) lbl.textContent = live ? TR("استخر در حال مصرف است", "Pool is being spent") : (ended ? TR("ایونت پایان یافت", "Event ended") : TR("تا شروع ایونت", "Until the event starts"));
    };
    tick();
    if (!__eventTimer) __eventTimer = setInterval(tick, 1000);
  }
  async function fetchEvent() {
    try {
      const r = await fetch(API_BASE + "/api/event", { headers: { "accept": "application/json" } });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.enabled === false) return;
      renderEvent(j);
    } catch (_) {}
  }
  function initEventWidget() {
    const qa = EVENT_QA;
    const hooks = document.querySelector("[data-event-countdown],[data-event-used],[data-event-bar],[data-event-status-text]");
    if (!hooks) return;
    fetchEvent();
    if (!__eventTimer) setInterval(fetchEvent, 20000);
    // copy buttons
    qa("[data-copy-model], [data-copy-model-btn]").forEach((el) => {
      el.addEventListener("click", async () => {
        const v = el.getAttribute("data-copy-model") || "gpt-6-luna-free";
        try { await navigator.clipboard.writeText(v); } catch (_) {}
        el.classList.add("event-copy-flash");
        setTimeout(() => el.classList.remove("event-copy-flash"), 900);
      });
    });
    qa("[data-copy-endpoint], [data-copy-endpoint-btn]").forEach((el) => {
      el.addEventListener("click", async () => {
        const v = (API_BASE || "https://api.tvframe.vip") + "/v1";
        try { await navigator.clipboard.writeText(v); } catch (_) {}
        el.classList.add("event-copy-flash");
        setTimeout(() => el.classList.remove("event-copy-flash"), 900);
      });
    });
  }

  function init() {
    // 0. EVENT widget (10B free GPT-6 — live mirror of apmix.ai)
    try { initEventWidget(); } catch (_) {}
    // 1. NAVBAR
    try {
      const toggle = document.querySelector(".nav-toggle");
      const navbar = document.querySelector(".navbar");
      if (toggle && navbar) {
        toggle.addEventListener("click", () => {
          navbar.classList.toggle("open");
        });
      }
      const navLinks = document.querySelectorAll("a[data-nav]");
      if (navLinks.length) {
        const curPath = location.pathname || "/";
        navLinks.forEach((a) => {
          try {
            const href = a.getAttribute("href") || a.href || "";
            let linkPath = "";
            try {
              linkPath = new URL(href, location.href).pathname;
            } catch (_) {
              linkPath = href;
            }
            // normalize: remove trailing slash except root
            const norm = (p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
            const cur = norm(curPath);
            const lp = norm(linkPath);
            if (!lp || lp === "/") {
              if (cur === "/" || cur === "/index.html" || cur.endsWith("/index.html")) {
                a.classList.add("active");
              }
              return;
            }
            if (cur === lp || cur.endsWith(lp) || lp.endsWith(cur)) {
              a.classList.add("active");
            } else if (lp.endsWith("/index.html") && cur === "/") {
              a.classList.add("active");
            }
          } catch (_) {}
        });
      }
    } catch (_) {}

    // 2. AUTH-AWARE CTA
    try {
      let token = null;
      try {
        token = localStorage.getItem("codism_token");
      } catch (_) {}
      if (token) {
        const ctas = document.querySelectorAll("a[data-auth-cta]");
        ctas.forEach((el) => {
          try {
            el.textContent = TR("داشبورد", "Dashboard");
            el.setAttribute("href", "dashboard.html");
          } catch (_) {}
        });
        document.querySelectorAll("a[data-auth-link]").forEach((el) => {
          try {
            if (ctas.length) {
              // a primary dashboard CTA already exists — hide the duplicate
              el.style.display = "none";
            } else {
              el.textContent = TR("داشبورد", "Dashboard");
              el.setAttribute("href", "dashboard.html");
            }
          } catch (_) {}
        });
      }
    } catch (_) {}

    // 3. COPY BUTTONS
    try {
      const copyEls = document.querySelectorAll("[data-copy]");
      copyEls.forEach((el) => {
        el.addEventListener("click", async (e) => {
          try {
            e.preventDefault();
            let raw = el.getAttribute("data-copy");
            let val = raw;
            if (raw === "self") {
              // try to find closest input/select/textarea
              let inp = null;
              // if el itself is input
              if (el.matches && el.matches("input, textarea, select")) {
                inp = el;
              } else {
                // search in parent container
                const parent = el.parentElement;
                if (parent) {
                  inp = parent.querySelector("input, textarea, select");
                }
                if (!inp && el.previousElementSibling && el.previousElementSibling.matches("input, textarea, select")) {
                  inp = el.previousElementSibling;
                }
                if (!inp && el.nextElementSibling && el.nextElementSibling.matches("input, textarea, select")) {
                  inp = el.nextElementSibling;
                }
                if (!inp) {
                  const closestForm = el.closest("form, div, section, label");
                  if (closestForm) inp = closestForm.querySelector("input, textarea, select");
                }
              }
              val = inp ? inp.value : "";
            }
            if (val == null) val = "";
            let copied = false;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              try {
                await navigator.clipboard.writeText(String(val));
                copied = true;
              } catch (_) {
                copied = false;
              }
            }
            if (!copied) {
              try {
                const ta = document.createElement("textarea");
                ta.value = String(val);
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                copied = true;
              } catch (_) {}
            }
            const original = el.textContent;
            const isInput = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
            if (!isInput) {
              el.textContent = "کپی شد!";
              setTimeout(() => {
                try {
                  el.textContent = original;
                } catch (_) {}
              }, 1500);
            } else {
              // for inputs, show temporary tooltip via title
              const prevTitle = el.getAttribute("title");
              el.setAttribute("title", "کپی شد!");
              setTimeout(() => {
                try {
                  if (prevTitle != null) el.setAttribute("title", prevTitle);
                  else el.removeAttribute("title");
                } catch (_) {}
              }, 1500);
            }
          } catch (_) {}
        });
      });
    } catch (_) {}

    // 4. BILLING TOGGLE
    try {
      const billingWrap = document.querySelector(".billing-toggle");
      const billingBtns = document.querySelectorAll(".billing-toggle button");
      const planCards = document.querySelectorAll(".plan-card");
      if (billingWrap && billingBtns.length && planCards.length) {
        function applyBilling(mode) {
          billingBtns.forEach((b) => {
            const bm = b.getAttribute("data-billing");
            if (bm === mode) b.classList.add("on");
            else b.classList.remove("on");
          });
          planCards.forEach((card) => {
            try {
              const priceEl = card.querySelector(".plan-price");
              if (priceEl) {
                const attr = mode === "yearly" ? "data-yearly" : "data-monthly";
                const html = card.getAttribute(attr);
                if (html != null) priceEl.innerHTML = html;
              }
              const billedEl = card.querySelector(".plan-billed");
              if (billedEl) {
                if (mode === "yearly") {
                  const txt = card.getAttribute("data-billed") || "";
                  billedEl.textContent = txt;
                  billedEl.style.display = "";
                  billedEl.hidden = false;
                  billedEl.removeAttribute("hidden");
                } else {
                  billedEl.style.display = "none";
                }
              }
            } catch (_) {}
          });
        }
        billingBtns.forEach((btn) => {
          btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-billing") || "monthly";
            applyBilling(mode);
          });
        });
        // initial state: check which has .on else default monthly
        let initial = "monthly";
        billingBtns.forEach((b) => {
          if (b.classList.contains("on")) initial = b.getAttribute("data-billing") || initial;
        });
        applyBilling(initial);
      }
    } catch (_) {}

    // 5. MODELS PAGE
    try {
      const grid = document.querySelector("[data-models-grid]");
      if (grid) {
        const countEl = document.querySelector("[data-models-count]");
        const qInput = document.querySelector("[data-models-q]");
        const capChips = document.querySelectorAll("[data-cap]");
        const sortSel = document.querySelector("[data-models-sort]");
        const resetBtn = document.querySelector("[data-models-reset]");

        const state = {
          q: "",
          caps: new Set(),
          sort: "default",
          maxPrice: null,
        };
        let allModels = [];
        let filtered = [];

        function showSkeletons() {
          try {
            grid.innerHTML = "";
            for (let i = 0; i < 6; i++) {
              const sk = document.createElement("div");
              sk.className = "skeleton";
              sk.style.height = "11rem";
              sk.style.borderRadius = "12px";
              grid.appendChild(sk);
            }
          } catch (_) {}
        }

        function renderCount(n) {
          if (!countEl) return;
          try {
            countEl.textContent = faNum(n) + " مدل";
          } catch (_) {}
        }

        function capChipsHtml(caps) {
          const map = [
            ["reasoning", "chip-reasoning", "استدلال"],
            ["tools", "chip-tools", "ابزارها"],
            ["vision", "chip-vision", "تصویر"],
            ["json", "chip-json", "JSON"],
            ["web", "chip-web", "وب"],
          ];
          let out = "";
          map.forEach(([key, cls, label]) => {
            if (caps && caps[key]) {
              out += '<span class="chip ' + cls + '">' + escapeHtml(label) + "</span>";
            }
          });
          return out;
        }

        function renderGrid(list) {
          try {
            grid.innerHTML = "";
            if (!list.length) {
              const empty = document.createElement("div");
              empty.className = "empty-row";
              empty.textContent = "مدلی با این فیلترها پیدا نشد — فیلترها را باز کنید.";
              empty.style.gridColumn = "1 / -1";
              empty.style.textAlign = "center";
              empty.style.padding = "2rem";
              empty.style.color = "#6B6659";
              grid.appendChild(empty);
              return;
            }
            list.forEach((m) => {
              const id = m.id || "";
              const provider = m.provider || "";
              const caps = m.capabilities || {};
              const ctx = m.context || 0;
              const desc = descForId(id);
              const pvClass = "pv-" + String(provider).toLowerCase().replace(/[^a-z0-9-]/g, "");
              const label = providerLabel(provider);
              const chips = capChipsHtml(caps);
              const ctxStr = fmtCtx(ctx);

              const card = document.createElement("div");
              card.className = "model-card card card-hover";
              card.style.padding = "1rem";
              card.style.display = "flex";
              card.style.flexDirection = "column";
              card.style.gap = ".5rem";

              card.innerHTML =
                '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                '<span class="pv ' +
                escapeHtml(pvClass) +
                '" style="width:8px;height:8px;border-radius:50%;display:inline-block;background:#D97757;flex-shrink:0"></span>' +
                '<code class="kbd" dir="ltr" style="font-weight:700">' +
                escapeHtml(id) +
                "</code>" +
                '<span class="badge badge-clay" style="margin-inline-start:auto">' +
                escapeHtml(label) +
                "</span>" +
                "</div>" +
                '<p style="font-size:.875rem;color:#545046;line-height:1.7;margin:0">' +
                escapeHtml(desc) +
                "</p>" +
                (chips
                  ? '<div class="cap-row" style="display:flex;flex-wrap:wrap;gap:.375rem">' + chips + "</div>"
                  : '<div class="cap-row" style="display:flex;flex-wrap:wrap;gap:.375rem"></div>') +
                '<div dir="ltr" style="font-family:var(--font-mono);font-size:.75rem;color:#6B6659;margin-top:auto;padding-top:.5rem;border-top:1px solid #F4F1EA">CTX ' +
                escapeHtml(ctxStr) +
                " \u00B7 IN included \u00B7 OUT included</div>";

              grid.appendChild(card);
            });
          } catch (_) {}
        }

        function applyFiltersAndSort() {
          try {
            let out = allModels.slice();
            const q = state.q.trim().toLowerCase();
            if (q) {
              out = out.filter((m) => {
                const id = String(m.id || "").toLowerCase();
                const d = descForId(m.id).toLowerCase();
                return id.includes(q) || d.includes(q);
              });
            }
            if (state.caps.size) {
              out = out.filter((m) => {
                const caps = m.capabilities || {};
                for (const c of state.caps) {
                  if (!caps[c]) return false;
                }
                return true;
              });
            }
            if (state.sort === "id-asc") {
              out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
            } else if (state.sort === "ctx-desc") {
              out.sort((a, b) => Number(b.context || 0) - Number(a.context || 0));
            }
            filtered = out;
            renderCount(filtered.length);
            renderGrid(filtered);
          } catch (_) {}
        }

        // events
        if (qInput) {
          qInput.addEventListener("input", () => {
            state.q = qInput.value || "";
            applyFiltersAndSort();
          });
        }
        if (capChips.length) {
          capChips.forEach((chip) => {
            chip.addEventListener("click", () => {
              const cap = chip.getAttribute("data-cap");
              if (!cap) return;
              if (state.caps.has(cap)) {
                state.caps.delete(cap);
                chip.classList.remove("on");
              } else {
                state.caps.add(cap);
                chip.classList.add("on");
              }
              applyFiltersAndSort();
            });
          });
        }
        if (sortSel) {
          sortSel.addEventListener("change", () => {
            state.sort = sortSel.value || "default";
            applyFiltersAndSort();
          });
        }
        if (resetBtn) {
          resetBtn.addEventListener("click", (e) => {
            try {
              e.preventDefault();
            } catch (_) {}
            state.q = "";
            state.caps.clear();
            state.sort = "default";
            if (qInput) qInput.value = "";
            capChips.forEach((c) => c.classList.remove("on"));
            if (sortSel) sortSel.value = "default";
            applyFiltersAndSort();
          });
        }

        // initial loading
        showSkeletons();
        renderCount(0);
        // fetch
        (async () => {
          try {
            const url = API_BASE + "/api/models";
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) throw new Error("fetch failed " + res.status);
            const json = await res.json();
            const data = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
            allModels = data;
            applyFiltersAndSort();
          } catch (err) {
            try {
              grid.innerHTML =
                '<div class="empty-row" style="grid-column:1/-1;text-align:center;padding:2rem;color:#DC2626">خطا در بارگذاری مدل‌ها — دوباره تلاش کنید.</div>';
              if (countEl) countEl.textContent = faNum(0) + " مدل";
            } catch (_) {}
          }
        })();
      }
    } catch (_) {}

    // 6. STATUS PAGE
    try {
      const gatewayEl = document.querySelector('[data-status="gateway"]');
      if (gatewayEl) {
        const upstreamEl = document.querySelector('[data-status="upstream"]');
        const metaEl = document.querySelector("[data-status-meta]");
        const pills = document.querySelectorAll("[data-status]");

        function setPill(el, mode, html) {
          if (!el) return;
          try {
            el.classList.remove("ok", "bad", "warn");
            el.classList.add(mode);
            // keep base class status-pill if present
            if (!el.classList.contains("status-pill")) el.classList.add("status-pill");
            el.innerHTML = html;
          } catch (_) {}
        }
        function setAllBad() {
          pills.forEach((p) => setPill(p, "bad", "اختلال"));
          if (metaEl) {
            try {
              metaEl.textContent = "خطا در دریافت وضعیت";
            } catch (_) {}
          }
        }
        (async () => {
          const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          let timeoutId = null;
          if (controller) {
            timeoutId = setTimeout(() => {
              try {
                controller.abort();
              } catch (_) {}
            }, 8000);
          }
          try {
            const url = API_BASE + "/api/status";
            const opts = { headers: { Accept: "application/json" } };
            if (controller) opts.signal = controller.signal;
            const res = await fetch(url, opts);
            if (timeoutId) clearTimeout(timeoutId);
            if (!res.ok) throw new Error("status " + res.status);
            const data = await res.json();
            const ok = !!data.ok;
            const upstream = data.upstream || {};
            const upOk = !!upstream.ok;
            const latency = upstream.latency_ms;
            const checkedAt = upstream.checked_at;

            // gateway pill
            if (ok) setPill(gatewayEl, "ok", "فعال");
            else setPill(gatewayEl, "bad", "اختلال");

            // upstream pill
            if (upstreamEl) {
              if (upOk) {
                const ms = Number(latency);
                const faMs = Number.isFinite(ms) ? faNum(ms) : "";
                // show «پاسخ‌گو (۸۱۲ms)» with ltr span for ms
                const html = 'پاسخ‌گو (<span dir="ltr">' + escapeHtml(faMs) + "ms</span>)";
                setPill(upstreamEl, "ok", html);
              } else if (upOk === false) {
                setPill(upstreamEl, "bad", "اختلال");
              } else {
                setPill(upstreamEl, "warn", "نامشخص");
              }
            }

            // meta line
            if (metaEl && checkedAt) {
              try {
                const d = new Date(checkedAt);
                let timeStr = "";
                try {
                  timeStr = d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
                } catch (_) {
                  const hh = String(d.getHours()).padStart(2, "0");
                  const mm = String(d.getMinutes()).padStart(2, "0");
                  const ss = String(d.getSeconds()).padStart(2, "0");
                  timeStr = hh + ":" + mm + ":" + ss;
                }
                let dateStr = "";
                try {
                  dateStr = d.toLocaleDateString("fa-IR");
                } catch (_) {
                  dateStr = d.toISOString().slice(0, 10);
                }
                metaEl.innerHTML =
                  'آخرین بررسی: <span dir="ltr">' + escapeHtml(timeStr) + "</span> — " + escapeHtml(dateStr);
              } catch (_) {}
            } else if (metaEl) {
              try {
                const now = new Date();
                let timeStr = "";
                try {
                  timeStr = now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
                } catch (_) {
                  timeStr = now.toTimeString().slice(0, 8);
                }
                let dateStr = "";
                try {
                  dateStr = now.toLocaleDateString("fa-IR");
                } catch (_) {
                  dateStr = now.toISOString().slice(0, 10);
                }
                metaEl.innerHTML =
                  'آخرین بررسی: <span dir="ltr">' + escapeHtml(timeStr) + "</span> — " + escapeHtml(dateStr);
              } catch (_) {}
            }
          } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            setAllBad();
          }
        })();
      }
    } catch (_) {}

    // 7. [data-soon] links
    try {
      document.querySelectorAll("[data-soon]").forEach((el) => {
        el.addEventListener("click", (e) => {
          try {
            e.preventDefault();
          } catch (_) {}
          alert("به‌زودی!");
        });
      });
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 9. Export
  try {
    window.Codism = { API_BASE: API_BASE };
  } catch (_) {}
})();
