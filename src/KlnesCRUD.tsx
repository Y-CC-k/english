import { useEffect, useState, type FormEvent } from "react";
import { addKlnes, deleteKlnes, listKlnes, type KlnesRow } from "./lib/klnes";

type Info = { kind: "ok" | "err"; text: string };

/** klnes 表的 CRUD 面板（新增／列表／刪除）。顯示在已登入的畫面中。 */
export default function KlnesCRUD() {
  const [rows, setRows] = useState<KlnesRow[] | null>(null); // null = 載入中
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setRows(await listKlnes());
      setLoadErr(null);
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : String(err));
      setRows([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      await addKlnes(title.trim(), note.trim() ? note.trim() : null);
      setTitle("");
      setNote("");
      setMsg({ kind: "ok", text: "已新增。" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setMsg(null);
    setDeletingId(id);
    try {
      await deleteKlnes(id);
      setMsg({ kind: "ok", text: "已刪除。" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="crud">
      <h2>klnes 表（新增／列表／刪除）</h2>
      <p className="sub">每一筆都記著「是誰加的」—— 只看得到、動得到自己那份（RLS）</p>

      <form className="form" onSubmit={submit}>
        <label className="field">
          標題（必填）
          <input
            type="text"
            required
            maxLength={200}
            placeholder="例如：第一件事"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          記錄（可不填）
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="補充內容…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "新增中…" : "新增"}
        </button>
      </form>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {loadErr && <p className="msg err">載入失敗：{loadErr}</p>}

      {rows === null ? (
        <p>載入中…</p>
      ) : rows.length === 0 ? (
        <p className="hint">目前沒有資料 —— 用上面的表單新增第一筆吧。</p>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <div className="item-main">
                <b>{r.title}</b>
                {r.note && <p className="item-note">{r.note}</p>}
                <small>{new Date(r.created_at).toLocaleString("zh-TW")}</small>
              </div>
              <button
                className="del"
                disabled={deletingId === r.id}
                onClick={() => { void remove(r.id); }}
              >
                {deletingId === r.id ? "刪除中…" : "刪除"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
