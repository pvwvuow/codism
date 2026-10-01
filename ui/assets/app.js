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

  function init() {
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

  // ---------- community event widgets ----------
  const EV = { state: null, skew: 0, timer: null };
  function evNum(n) {
    try {
      if (window.I18N && window.I18N.lang === "en") return String(n);
      return faNum(n);
    } catch (_) { return String(n); }
  }
  function evPad(n) {
    const s = String(Math.max(0, Math.floor(n)));
    return s.length < 2 ? "0" + s : s;
  }
  function evStatusFa(st) {
    if (st === "scheduled") return "به‌زودی شروع می‌شود";
    if (st === "live") return "زنده";
    if (st === "ended") return "پایان یافت";
    return "غیرفعال";
  }
  function evStatusEn(st) {
    if (st === "scheduled") return "Starts soon";
    if (st === "live") return "Live now";
    if (st === "ended") return "Ended";
    return "Disabled";
  }
  function evFmtBig(n) {
    const v = Number(n) || 0;
    if (window.I18N && window.I18N.lang === "en") return fmtTok(v);
    if (v >= 1e9) return evNum((v / 1e9).toFixed(1).replace(/\.0$/, "")) + " میلیارد";
    if (v >= 1e6) return evNum((v / 1e6).toFixed(1).replace(/\.0$/, "")) + " میلیون";
    return evNum(v);
  }
  function evTick() {
    const st = EV.state;
    if (!st || !st.opens_at) return;
    const nowMs = Date.now() - EV.skew;
    const openMs = Date.parse(st.opens_at);
    if (!Number.isFinite(openMs)) return;
    const diff = openMs - nowMs;
    const q = (sel) => document.querySelectorAll(sel);
    const setAll = (sel, v) => { try { q(sel).forEach((el) => { el.textContent = v; }); } catch (_) {} };
    if (diff > 0) {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const en = window.I18N && window.I18N.lang === "en";
      setAll("[data-event-cd-d]", en ? String(d) : faNum(evPad(d)));
      setAll("[data-event-cd-h]", en ? evPad(h) : faNum(evPad(h)));
      setAll("[data-event-cd-m]", en ? evPad(m) : faNum(evPad(m)));
      setAll("[data-event-cd-s]", en ? evPad(s) : faNum(evPad(s)));
      setAll("[data-event-cd-label]", en ? "Until the event opens" : "تا شروع ایونت");
      setAll("[data-event-mini-cd]", (en ? "opens in " : "شروع تا ") + evPad(d) + "d " + evPad(h) + ":" + evPad(m) + ":" + evPad(s));
      try { q("[data-event-cd-wrap]").forEach((el) => { el.style.display = ""; }); } catch (_) {}
    } else {
      setAll("[data-event-cd-label]", st.status === "ended" ? (en2() ? "The event has ended" : "ایونت به پایان رسیده") : (en2() ? "The event is live" : "ایونت زنده است"));
      const zero = en2() ? "00" : faNum("00");
      setAll("[data-event-cd-d]", zero); setAll("[data-event-cd-h]", zero);
      setAll("[data-event-cd-m]", zero); setAll("[data-event-cd-s]", zero);
      setAll("[data-event-mini-cd]", st.status === "ended" ? (en2() ? "event ended" : "ایونت تمام شد") : (en2() ? "LIVE" : "زنده"));
    }
  }
  function en2() { return window.I18N && window.I18N.lang === "en"; }
  function evRender() {
    const st = EV.state;
    if (!st) return;
    const q = (sel) => document.querySelectorAll(sel);
    const setAll = (sel, v) => { try { q(sel).forEach((el) => { el.textContent = v; }); } catch (_) {} };
    const stFa = evStatusFa(st.status), stEn = evStatusEn(st.status);
    try {
      q("[data-event-status]").forEach((el) => {
        while (el.firstChild) el.removeChild(el.firstChild);
        const dot = document.createElement("i");
        dot.className = "dot";
        el.appendChild(dot);
        el.appendChild(document.createTextNode(en2() ? stEn : stFa));
        el.setAttribute("data-event-state", st.status);
      });
    } catch (_) {}
    if (st.model) { setAll("[data-event-model]", st.model); }
    if (Number.isFinite(Number(st.pool_total))) {
      setAll("[data-event-total]", evFmtBig(st.pool_total));
      setAll("[data-event-remaining]", evFmtBig(Math.max(0, Number(st.pool_remaining) || 0)));
    }
    if (Number.isFinite(Number(st.pool_spent))) {
      setAll("[data-event-spent]", evNum(Number(st.pool_spent).toLocaleString("en-US")));
      const total = Number(st.pool_total) || 0;
      const pct = total > 0 ? Math.min(100, (Number(st.pool_spent) / total) * 100) : 0;
      try { q("[data-event-bar]").forEach((el) => { el.style.width = pct.toFixed(2) + "%"; }); } catch (_) {}
      setAll("[data-event-spent-pct]", evNum(pct.toFixed(1)) + (en2() ? "%" : "٪"));
    }
    evTick();
  }
  async function evRefresh() {
    try {
      const r = await fetch(API_BASE + "/api/event", { headers: { accept: "application/json" } });
      if (!r || !r.ok) return;
      const j = await r.json();
      if (j && j.ok) {
        EV.state = j;
        const srvMs = Date.parse(j.now);
        EV.skew = Number.isFinite(srvMs) ? Date.now() - srvMs : 0;
        evRender();
      }
    } catch (_) {}
  }
  function initEventWidgets() {
    const need = document.querySelector("[data-event-status],[data-event-mini-cd],[data-event-bar],[data-event-cd-wrap]");
    if (!need) return;
    evRefresh();
    setInterval(evRefresh, 30000);
    EV.timer = setInterval(evTick, 1000);
    try {
      document.querySelectorAll("[data-event-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const model = (document.querySelector("[data-event-model]") || {}).textContent || "";
          try { await navigator.clipboard.writeText(String(model).trim()); } catch (_) {}
          const ok = document.querySelector("[data-event-copied]");
          if (ok) { ok.hidden = false; setTimeout(() => { try { ok.hidden = true; } catch (_) {} }, 2000); }
        });
      });
      document.querySelectorAll("[data-event-copy-base]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(API_BASE + "/v1"); } catch (_) {}
          const t = btn.textContent;
          btn.textContent = en2() ? "Copied" : "کپی شد";
          setTimeout(() => { try { btn.textContent = t; } catch (_) {} }, 2000);
        });
      });
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { init(); initEventWidgets(); });
  } else {
    init();
    initEventWidgets();
  }

  // 9. Export
  try {
    window.Codism = { API_BASE: API_BASE };
  } catch (_) {}
})();
