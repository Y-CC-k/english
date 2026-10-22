import { useState, type FormEvent } from "react";
import { friendlyAuthError, sendResetMail, signIn, signUp } from "./lib/auth";

type Mode = "login" | "register";
type Info = { kind: "ok" | "warn" | "err"; text: string };

/** 登入／註冊表單（同一個元件，上方切頁籤）；initialEmail 可預填（訪客模式用）。 */
export default function AuthForms({ initialEmail, guestHint }: { initialEmail?: string; guestHint?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setInfo(null);

    if (mode === "register" && password !== password2) {
      setInfo({ kind: "err", text: "兩次輸入的密碼不同。" });
      return;
    }
    if (password.length < 6) {
      setInfo({ kind: "err", text: "密碼至少要 6 個字元。" });
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          setInfo({ kind: "err", text: friendlyAuthError(error.message) });
        }
        // 成功時 App.tsx 會透過 onAuthStateChange 自動切換到使用者畫面
      } else {
        const { needConfirm, error } = await signUp(email.trim(), password);
        if (error) {
          setInfo({ kind: "err", text: friendlyAuthError(error.message) });
        } else if (needConfirm) {
          setInfo({
            kind: "warn",
            text: "註冊成功！Supabase 已寄確認信到 " + email.trim() + "，收完信再回來登入。",
          });
          setPassword("");
          setPassword2("");
        } else {
          // 專案關閉「Confirm email」時會直接拿到 session → 自動視為已登入
          setInfo({ kind: "ok", text: "註冊成功，已登入。" });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (busy) return;
    if (!email.trim()) {
      setInfo({ kind: "err", text: "先填入 Email，再按「忘記密碼」。註冊與發信共用這個規則。" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await sendResetMail(email.trim());
      setInfo(
        error
          ? { kind: "err", text: friendlyAuthError(error.message) }
          : { kind: "ok", text: "已寄出重設密碼信到 " + email.trim() + "，請收信操作。" },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setInfo(null); }}>
          登入
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => { setMode("register"); setInfo(null); }}
        >
          註冊
        </button>
      </div>

      {guestHint && <p className="notice">🎮 {guestHint}</p>}

      {mode === "register" && (
        <p className="notice">
          新專案預設開啟「Confirm email」：註冊後 Supabase 會寄一封確認信，
          點信裡的連結完成驗證後才能登入。
        </p>
      )}

      <label className="field">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="field">
        密碼
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="至少 6 個字元"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {mode === "register" && (
        <label className="field">
          再輸入一次密碼
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="與上面相同"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </label>
      )}

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "處理中…" : mode === "login" ? "登入" : "註冊"}
      </button>

      {mode === "login" && (
        <button className="ghost" type="button" onClick={forgot}>
          忘記密碼？
        </button>
      )}

      {info && <p className={`msg ${info.kind}`}>{info.text}</p>}
    </form>
  );
}
