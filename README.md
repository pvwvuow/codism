# Codism AI Panel — tvframe.vip

پنل مدیریت AI اختصاصی با Base URL خودت — پروکسی OpenAI-Compatible به CodeCraft

## ویژگی‌ها
- Base URL اختصاصی: `https://tvframe.vip/v1` (قابل تغییر به `https://ai.tvframe.vip/v1`)
- ساخت بی‌نهایت کلید `codism_...` و اشتراک بین کاربران
- سهمیه‌بندی روزانه/ماهانه + محدودیت مدل
- لاگ و آمار کامل (توکن، مدل، latency)
- Playground تست مستقیم
- مستندات cURL / JS / Python آماده کپی
- پنل ادمین: مدیریت کاربران

## اجرا
```bash
npm install
npm run init-db   # ساخت ادمین از .env
npm start         # http://localhost:3000
```

## ENV
```
PORT=3000
JWT_SECRET=...
UPSTREAM_BASE_URL=https://codecraftapi.com/v1
UPSTREAM_API_KEY=cc_...
PUBLIC_BASE_URL=https://tvframe.vip
ADMIN_EMAIL=admin@tvframe.vip
ADMIN_PASSWORD=<set-a-strong-password-at-deploy-time>
```

## دیپلوی روی tvframe.vip
- اگر دامنه اصلی مشغول است، یک ساب‌دامین بساز: `ai.tvframe.vip` → مقدار `PUBLIC_BASE_URL=https://ai.tvframe.vip`
- روی هاست Node (یا VPS) فایل‌ها را قرار بده، `npm install && npm run init-db && pm2 start server/index.js`
- پروکسی معکوس Nginx به پورت 3000

## استفاده توسط کاربر نهایی
```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "https://tvframe.vip/v1", apiKey: "codism_XXX" });
await client.chat.completions.create({ model:"gpt-4o-mini", messages:[{role:"user",content:"سلام"}] });
```
