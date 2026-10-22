# supabase-app

**Vite + React + TypeScript + @supabase/supabase-js** 的 Supabase 連線骨架。
打開頁面按「測試連線」，會依序檢查：REST API 金鑰、Auth 服務、實際查詢資料表。

---

## 1. 事前準備：申請 Supabase 專案

1. 到 <https://supabase.com/dashboard> 註冊／登入（可用 GitHub 帳號），建立一個 **Free** 專案。
2. 進入專案後，右上角 **Connect**（或 **Project Settings → Data API**）可以看到兩個值：
   - **Project URL**：`https://xxxx.supabase.co`
   - **anon public key**：一長串 `eyJhbGci…` 的字串
3. 免費專案**閒置約 1–2 週會被暫停**，到 Dashboard 按一下 **Restore** 就會恢復。

> 安全觀念：anon key 本來就是設計放在前端的**公開金鑰**，
> 保護資料要靠資料庫的 **RLS（Row Level Security）**。
> `service_role key` 絕對不可以放進前端或這個專案。

---

## 2. 安裝與設定

```powershell
cd D:\supabase-app
npm.cmd install      # 本機群組原則封鎖 npm.ps1 的話，一律用 npm.cmd
```

把設定範本複製成 `.env`，填入剛剛拿到的兩個值：

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` 內容（**改完要重啟 dev server** 才會生效）：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi…
```

> Vite 的規則：前端要用到的環境變數**必須以 `VITE_` 開頭**，
> 其他前綴的變數不會被打包進去（這是刻意的安全機制，防止伺服器金鑰外洩）。

---

## 3. 執行

```powershell
npm.cmd run dev       # 開發模式，瀏覽器開 http://127.0.0.1:5173
npm.cmd run build     # 正式打包（先跑 TypeScript 檢查再打包到 dist/）
npm.cmd run preview   # 預覽打包結果
npm.cmd run typecheck # 只跑 TypeScript 檢查
```

> 主控台中文亂碼（純顯示問題）：先執行 `chcp 65001`。

頁面按 **測試連線** 後會看到三個檢查：

| 檢查 | 通過代表 |
| --- | --- |
| ① Auth 服務 + 金鑰驗證 | URL 正確、專案運行中、publishable key 被接受（HTTP 200） |
| ② REST API 描述端點 | 新版金鑰架構只收 secret key → 顯示 ⚠ 是**正常**的；顯示 ✔ 也正常（舊版 JWT 金鑰） |
| ③ 查詢 `public.klnes` | supabase-js 真的打通了資料庫（未登入時通常回 0 筆，屬正常） |

③ 顯示「還沒建表」是正常的 —— 先做下一步。

---

## 4. 登入／註冊（Supabase Auth）

首頁就是登入／註冊表單（`src/AuthForms.tsx`），功能：

| 功能 | 說明 |
| --- | --- |
| 註冊 | `auth.signUp(email, password)`；預設會寄確認信，收完信才能登入 |
| 登入 | `auth.signInWithPassword`；成功後 session 存在瀏覽器 localStorage，重新整理不會掉 |
| 登出 | `auth.signOut()`，登入後頁面右上區有按鈕 |
| 忘記密碼 | `auth.resetPasswordForEmail`；會寄出重設信 |

### 4.1 要到 Dashboard 檢查的兩個設定

| 設定 | 位置 | 用途 |
| --- | --- | --- |
| **Confirm email** | Authentication → Sign In / Providers → Email | 預設**開啟**：註冊後必須收信驗證。測試期間可暫時關閉（註冊後直接拿 session） |
| **Site URL** | Project Settings → URL Configuration | 設成 `http://127.0.0.1:5173`，確認信／重設信的連結才會導回本機頁面 |

### 4.2 常見錯誤對照

| Supabase 訊息 | 程式顯示 |
| --- | --- |
| `Invalid login credentials` | Email 或密碼不正確 |
| `Email not confirmed` | 尚未完成驗證，請先收確認信 |
| `User already registered` | 此 Email 已註冊，請改用登入 |
| `Password should be at least 6 characters` | 密碼至少 6 個字元 |
| 寄信 429 / rate limit | 稍後再試（免費方案每小時寄信有限） |

---

## 5. 建立示範資料表（klnes，綁定登入者）

CRUD 功能直接寫在資料表的 **RLS（Row Level Security）** 上：每個登入者只能讀／寫／刪
`user_id` 是自己那欄的資料，未登入的訪客什麼都動不了。
把下面整段貼到 Dashboard → **SQL Editor** 執行（會把原本的 `klnes` 重建）：

```sql
drop table if exists public.klnes;

create table public.klnes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.klnes enable row level security;

create policy "登入者可讀自己的資料" on public.klnes
  for select to authenticated using (auth.uid() = user_id);

create policy "登入者可新增自己的資料" on public.klnes
  for insert to authenticated with check (auth.uid() = user_id);

create policy "登入者可刪自己的資料" on public.klnes
  for delete to authenticated using (auth.uid() = user_id);
```

三個設計重點：

1. `user_id uuid not null default auth.uid()` —— 前端**不需要**也不能送 `user_id`，
   Postgres 自己用登入者的 ID 填，防止假冒。
2. 三條 policy 都只給 `to authenticated`，且都以 `auth.uid() = user_id` 條件收緊。
3. 想清理自己所有資料時：`delete from public.klnes where user_id = auth.uid();`（在 SQL Editor 用你自己身分執行不了，還是要走畫面；管理員可刪整表）。

---

## 6. 專案結構

```
supabase-app/
├─ index.html            進入頁面
├─ vite.config.ts        Vite 設定
├─ .env.example          設定範本（複製成 .env 填入）
├─ scripts/
│  └─ check-url.mjs      CLI 連線診斷（node scripts\check-url.mjs <url> <key> [table]）
├─ src/
│  ├─ main.tsx           React 掛載點
│  ├─ App.tsx            首頁：依登入狀態切換使用者卡片／登入表單
│  ├─ AuthForms.tsx      登入／註冊／忘記密碼表單
│  ├─ KlnesCRUD.tsx      klnes 表的新增／列表／刪除面板（登入後顯示）
│  ├─ ConnectTest.tsx    連線三項測試（可收合）
│  ├─ App.css
│  ├─ vite-env.d.ts      環境變數的型別宣告
│  └─ lib/
│     ├─ supabase.ts     Supabase client（單例，從 import.meta.env 讀設定）
│     ├─ auth.ts         登入／註冊／登出／session 訂閱與錯誤中文化
│     └─ klnes.ts        klnes 表的 CRUD API 封裝（新增／列出／刪除＋RLS 錯誤中文化）
├─ 1200E/                1200 單字資料區（使用者自行整理中；版控暫時排除）
│  ├─ Audio/             各年級各週的單字 mp3（Grade3～6）
│  ├─ document/          grade3~6.json 單字資料（週次 → word/phonetic/pos/chinese/sentence）
│  └─ index.html 等      原本的單字瀏覽靜態頁
```

> **1200E 資料區備忘**（未來做評量活動時）：
> - mp3 檔名慣例：小寫、去空白與括號內文字（例：`a few` → `afew.mp3`）
> - `document\grade6.json` 有「上層版（帶空白、415 字）」與 `新增資料夾` 版（無空白、
>   432 字、與音檔完全對齊）兩個版本，整理時統一擇一
> - Grade4 有 66 字、Grade5 有 30 字（`boxes(box)`、`thicker (thick)` 等變化形）
>   目前的檔名規則找不到對應 mp3，做評量時需要音檔映射表

---

## 6.1 版控與 GitHub

儲存庫已初始化（主分支 `main`），`.env`、`node_modules/`、`dist/`、`1200E/` 都在
`.gitignore` 排除，不會被 commit。推上 GitHub：

```powershell
# 方法一：用 GitHub 網頁建好空儲存庫後
git remote add origin https://github.com/<你的帳號>/<儲存庫名>.git
git push -u origin main

# 方法二：裝了 GitHub CLI 的話一條指令建庫＋推
gh repo create <儲存庫名> --private --source . --push
```

金鑰安全提醒：`publishable key` 放前端是設計如此，可以進版控；
`service_role`／`secret` 金鑰**永遠**不能 commit，也不要放進這個儲存庫的任何檔案。
```

之後要擴充（Realtime、Storage）都在 `src/lib/` 加檔案即可：

```ts
// Realtime：監聽 klnes 表的新增
supabase()!
  .channel("klnes-ch")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "klnes" }, (payload) => {
    console.log("收到新資料：", payload.new);
  })
  .subscribe();
```

---

## 7. 疑難排解

| 症狀 | 處理 |
| --- | --- |
| `npm` 無法執行（PowerShell 停用腳本） | 改用 `npm.cmd` |
| 改了 `.env` 沒反應 | 重啟 dev server（Ctrl+C 再 `npm.cmd run dev`）；Vite 也會自動偵測 `.env` 重新啟動 |
| HTTP 401「Invalid API key」 | 金鑰填錯／輪替過 → Project Settings → Data API 重新複製 publishable key |
| HTTP 401「Secret API key required」（`/rest/v1/` 根端點） | 新金鑰架構的正常行為：根端點只收 secret key（伺服器端用），查表不受影響 |
| `/auth/v1/health` 401「No API key found」 | 新專案連健康檢查都要帶 `apikey` header |
| 無法連線、逾時 | URL 打錯、防火牆擋 443，或專案被暫停 → Dashboard 按 Restore |
| 查詢回 `PGRST205`「Could not find the table」 | 表還沒建（連線其實是通的）；若提示要建表或收緊 RLS，見第 5 節 |
| 中文亂碼 | `chcp 65001`（僅顯示問題） |

### CLI 快速診斷

```powershell
node scripts\check-url.mjs https://xxxx.supabase.co sb_publishable_xxx [table]
```

會先打 Auth 健康檢查（驗 URL ＋金鑰），再用金鑰實際查一張表（驗 DB 通路）。
