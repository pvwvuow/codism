# Codism AI Panel — tvframe.vip

پنل مدیریت و فروش API هوش مصورف — نسخه‌ی اجراشده روی Supabase Edge Functions (Deno)

## وضعیت فعلی (نسخه Deno / Supabase)
- کل پنل یک فایل مستقل است: `supabase/functions/panel/index.selfcontained.ts`
- شامل: UI فارسی RTL + احراز هویت JWT + مدیریت کاربر توسط ادمین + کلیدهای `codism_*` + سهمیه روزانه/ماهانه + لاگ مصرف + پراکسی OpenAI-Compatible به آپستریم
- دیتابیس: Postgres (جداول `users` / `api_keys` / `usage_log` + توابع RPC آماری)
- همه‌ی مقادیر محرمانه فقط به‌صورت Secret در پروژه‌ی Supabase نگهداری می‌شوند — در این ریپو هیچ کلیدی نیست

## آدرس‌ها
- پنل (رابط کاربری): `https://pvwvuow.github.io/codism/`
  - نکته: پلن رایگان Supabase اجازه‌ی نمایش HTML از Edge Function را نمی‌دهد (anti-phishing؛ پاسخ text/html به text/plain تبدیل می‌شود)؛ بنابراین UI روی GitHub Pages میزبانی می‌شود و آدرس قدیمی `…/functions/v1/panel/` به‌صورت خودکار (302) به همین آدرس ریدایرکت می‌شود
- Base URL برای کلاینت‌ها (VSCode/curl/openai SDK): `https://lmdevpnsviwjdycwhahh.supabase.co/functions/v1/panel/v1`
- API آدرس‌های `/api/*` و `/v1/*` همان Edge Function هستند؛ UI از CORS با `Access-Control-Allow-Origin: *` به آن‌ها وصل می‌شود

## Environment (Secrets در داشبورد Supabase)
```
PANEL_SUPABASE_URL      # آدرس پروژه
PANEL_SERVICE_ROLE      # کلید سرویس‌رول
UPSTREAM_API_KEY        # کلید آپستریم (فقط در secrets — هرگز در ریپو/کد)
UPSTREAM_BASE_URL
MODEL_ALIASES           # مثل {"gpt-4o":"claude-opus-5.5"}
JWT_SECRET  ADMIN_EMAIL  ADMIN_PASSWORD  MAX_BODY_MB
```

## نکته‌ها
- آپستریم پشت Cloudflare است؛ تابع حتماً User-Agent مرورگر می‌فرستد و چالش 403 HTML را به 502 استاندارد تبدیل می‌کند
- ثبت‌نام عمومی وجود ندارد؛ فقط ادمین کاربر می‌سازد
- محدودیت: هر کاربر حداکثر ۱۰ کلید فعال

---
## نسخه قدیمی Express (برای VPS — مرجع)
کد `server/` + `public/` نسخه‌ی Node/SQLite است که نیازمند هاست Node بود؛ به‌دلیل چالش Cloudflare روی Node، نسخه‌ی Deno/Supabase جایگزین شد.
