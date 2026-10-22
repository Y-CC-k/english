import { useState } from "react";
import { supabase, loadConfig } from "./lib/supabase";

/** 一則測試結果 */
type Check = {
  label: string;
  status: "pending" | "ok" | "warn" | "fail";
  message: string;
};

function mark(status: Check["status"]) {
  return status === "ok" ? "✔" : status === "warn" ? "⚠" : status === "fail" ? "✖" : "…";
}

/**
 * 測試 1：Auth 服務健康檢查（帶金鑰）。
 * 新版專案連 /auth/v1/health 都要求 apikey header —— 過了這關代表
 * URL 正確、專案運行中、且金鑰被接受。
 */
async function testAuthHealth(url: string, key: string): Promise<Check> {
  const label = `Auth 服務 + 金鑰驗證（${url}/auth/v1/health）`;
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
  } catch (err) {
    return {
      label,
      status: "fail",
      message: [
        "無法建立連線：" + (err instanceof Error ? err.message : String(err)),
        "可能原因：URL 填錯（少打 https://）、學校網路擋 443、",
        "或免費專案閒置太久被暫停（到 Dashboard 按 Restore）。",
      ].join(" "),
    };
  }
  if (res.ok) {
    return { label, status: "ok", message: "URL 正確、專案運行中、金鑰被接受（HTTP 200）" };
  }
  const body = await res.text().catch(() => "");
  if (res.status === 401) {
    return {
      label,
      status: "fail",
      message:
        "被拒絕（HTTP 401）：" + body +
        " ← 金鑰無效或已輪替，請到 Project Settings → Data API 重新複製 publishable key。",
    };
  }
  return { label, status: "fail", message: `預期外的狀態碼：HTTP ${res.status} ${res.statusText}` };
}

/**
 * 測試 2：REST API 根端點（OpenAPI 描述頁）。
 * 新金鑰架構的專案這裡只收 secret key（伺服器端用途），
 * publishable key 打過去會 401「Secret API key required」—— 那是正常現象，不是失敗。
 */
async function testApiSpec(url: string, key: string): Promise<Check> {
  const label = `REST API 描述端點（${url}/rest/v1/）`;
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } });
    if (res.ok) return { label, status: "ok", message: "OpenAPI 描述可讀，REST 服務正常" };
    const body = await res.text().catch(() => "");
    if (body.includes("Secret API key required")) {
      return {
        label,
        status: "warn",
        message:
          "此專案使用新版金鑰架構：根端點只收 secret key（僅伺服器端用），" +
          "前端用 publishable key 查資料不受影響（下一項就在查表）。",
      };
    }
    return { label, status: "fail", message: `HTTP ${res.status}：${body.slice(0, 200)}` };
  } catch (err) {
    return { label, status: "fail", message: err instanceof Error ? err.message : String(err) };
  }
}

/** 測試 3：用 supabase-js 實際查詢 public.klnes 資料表。 */
async function testTable(): Promise<Check> {
  const label = "資料庫查詢（public.klnes）";
  try {
    const { data, error } = await supabase()!.from("klnes").select("*").limit(5);
    if (error) {
      // 還沒執行 README 第 5 節的重建 SQL → 連線其實是通的
      if (error.code?.startsWith("PGRST")) {
        return {
          label,
          status: "warn",
          message:
            "supabase-js 已打通資料庫，但查無 public.klnes（還沒重建示範表）。" +
            "照 README 第 5 節把 SQL 貼到 SQL Editor 執行後再測一次。",
        };
      }
      return { label, status: "fail", message: `${error.code ?? "?"} ${error.message}` };
    }
    return {
      label,
      status: "ok",
      message:
        `查詢成功，目前 ${data.length} 筆` +
        (data.length ? "：" + data.map((r) => JSON.stringify(r)).join("；") : "") +
        "（RLS 只回登入者自己的資料，未登入時通常 0 筆）",
    };
  } catch (err) {
    return { label, status: "fail", message: err instanceof Error ? err.message : String(err) };
  }
}

/** 連線測試面板（可從主畫面收合）。 */
export default function ConnectTest() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const { configured } = loadConfig();

  async function run() {
    const c = loadConfig();
    if (!c.configured || !supabase()) {
      setChecks([
        {
          label: "設定檢查",
          status: "fail",
          message: "缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，請先建立 .env。",
        },
      ]);
      return;
    }
    setRunning(true);
    setChecks([]);
    stage(await testAuthHealth(c.url, c.key));
    stage(await testApiSpec(c.url, c.key));
    stage(await testTable());
    setRunning(false);

    function stage(next: Check) {
      setChecks((prev) => [...prev, next]);
    }
  }

  return (
    <section>
      <button className="btn" onClick={run} disabled={running}>
        {running ? "測試中…" : "測試連線"}
      </button>

      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.label} className={`check ${c.status}`}>
              <span className="mark">{mark(c.status)}</span>
              <span className="body">
                <b>{c.label}</b>
                <span className="msg">{c.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!configured && <p className="hint">目前尚未偵測到 .env 設定。</p>}
    </section>
  );
}
