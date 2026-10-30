import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import './Battle.css';

export default function Battle({ grade: initGrade, week: initWeek, onBack }: { grade?: number; week?: number; onBack: () => void }) {
  const [monster, setMonster] = useState<any>(null);
  const [mHP, setMHP] = useState(0);
  const [pHP, setPHP] = useState(100);
  const [grade, setGrade] = useState<number | null>(initGrade ?? null);
  const [week, setWeek] = useState<number | null>(initWeek ?? null);
  const [phase, setPhase] = useState<'setup' | 'loading' | 'battle' | 'victory' | 'defeat'>(
    initGrade && initWeek ? 'loading' : 'setup'
  );
  const [questions, setQuestions] = useState<any[]>([]);
  const [curr, setCurr] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());
  const [shake, setShake] = useState(false);
  const [dmg, setDmg] = useState<{val: number} | null>(null);
  // 怪物位置（隨機漫步）與受擊變色
  const [monPos, setMonPos] = useState({ x: 50, y: 50 });
  const [monHit, setMonHit] = useState(false);
  const monPosRef = useRef({ x: 50, y: 45 });
  // 🤖 機器人：答對後走出來 → 舉弓拉弦 → 放箭殺怪的表演
  const [heroState, setHeroState] = useState<"hidden" | "walk" | "aim" | "draw" | "shoot" | "back">("hidden");
  const [heroPos, setHeroPos] = useState({ x: -10, y: 60 });
  const heroSeqRef = useRef(0);
  const heroActiveRef = useRef(false);
  // 箭：從弓的位置飛向怪物（fly 後用 CSS transition 飛過去）
  interface ArrowFly { x: number; y: number; dx: number; dy: number; ang: number; fly: boolean }
  const [arrow, setArrow] = useState<ArrowFly | null>(null);

  // 戰鬥中怪物到處跑（每 1.3 秒換一個隨機位置；機器人演出期間暫停亂跑，箭才打得準）
  useEffect(() => {
    if (phase !== 'battle') return;
    setMonPos({ x: 50, y: 45 });
    monPosRef.current = { x: 50, y: 45 };
    const t = setInterval(() => {
      if (heroActiveRef.current) return;
      const p = { x: 15 + Math.random() * 70, y: 10 + Math.random() * 55 };
      monPosRef.current = p;
      setMonPos(p);
    }, 1300);
    return () => clearInterval(t);
  }, [phase, curr]);

  /** 答對演出：機器人走入戰場 → 站定射擊點 → 舉弓拉弦 → 放箭（命中＝變色＋傷害飄字）→ 退場 */
  function robotShoot(damage: number) {
    const seq = ++heroSeqRef.current;               // 新演出開始 → 舊演出計時全部作廢
    heroActiveRef.current = true;
    const at = (ms: number, fn: () => void) =>
      window.setTimeout(() => {
        if (heroSeqRef.current === seq) {
          fn();
          if (ms >= 2070) heroActiveRef.current = false;
        }
      }, ms);
    const my = monPosRef.current.y + 4;             // 機器人站的高度（跟怪同一條地平線）
    const mx = monPosRef.current.x;
    const standX = Math.max(mx - 13, 5);            // 射擊定位點：怪左邊一段距離
    const sx = standX + 3.4, sy = my - 2.2;         // 弓/箭起始位置（胸口高度）
    const tx = mx, ty = monPosRef.current.y - 1.5;  // 箭目標：怪物中心
    const ang = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
    at(0,   () => { setHeroState("walk"); setHeroPos({ x: -8, y: my }); });
    at(40,  () => setHeroPos({ x: standX, y: my }));               // 走到射擊點（CSS transition）
    at(600, () => setHeroState("aim"));                            // 站定，舉弓
    at(760, () => setHeroState("draw"));                           // 拉弦
    at(920, () => {                                                // 放箭！
      setHeroState("shoot");
      setArrow({ x: sx, y: sy, dx: tx - sx, dy: ty - sy, ang, fly: false });
    });
    at(960,  () => setArrow(a => (a ? { ...a, fly: true } : a)));  // 箭朝怪物飛去
    at(1210, () => { setMonHit(true); setDmg({ val: damage }); setArrow(null); }); // 命中：變色＋傷害飄字
    at(1520, () => { setMonHit(false); setHeroState("back"); setHeroPos({ x: -14, y: my }); }); // 收弓退場
    at(1750, () => setDmg(null));
    at(2070, () => setHeroState("hidden"));         // 約 2 秒整段收尾
  }

  useEffect(() => {
    if (!grade || !week) return;
    async function init() {
      const sb = supabase();
      if (!sb) return;

      // 開戰隨機抽一隻怪（年級越高越硬：HP+25/級、攻擊+1/級）
      const { data: mList } = await sb.from('monsters').select('*');
      const picked = mList && mList.length > 0
        ? mList[Math.floor(Math.random() * mList.length)]
        : null;
      if (picked) {
        const lvl = (grade ?? 3) - 3;
        const m = { ...picked, max_hp: picked.max_hp + lvl * 25, attack_power: picked.attack_power + lvl };
        setMonster(m);
        setMHP(m.max_hp);
      }
      const { data: wData } = await sb
        .from('words')
        .select('*')
        .eq('grade', grade!)
        .eq('week', week!)
        .limit(10);

      if (wData && wData.length > 0) {
        // 自動生成選項（一個正確 + 三個隨機錯誤）
        const processed = wData.map(q => ({
          ...q,
          correct: q.chinese,
          options: [q.chinese, ...wData.filter(x => x.chinese !== q.chinese).slice(0, 3).map(x => x.chinese)].sort(() => Math.random() - 0.5)
        }));
        setQuestions(processed);
      }
      setPhase('battle');
    }
    init();
  }, [grade, week]);

  // 選關頁：先挑年級／週次再開戰
  if (phase === 'setup') {
    return (
      <div className="battle-container battle-setup">
        <h2>⚔️ 挑戰副本</h2>
        <p className="setup-hint">選好年級與週次，點開戰去討伐史萊姆單字怪！</p>
        <div className="setup-row">
          <select value={grade ?? ""} onChange={(e) => setGrade(Number(e.target.value) || null)}>
            <option value="">選年級</option>
            <option value="3">三年級</option>
            <option value="4">四年級</option>
            <option value="5">五年級</option>
            <option value="6">六年級</option>
          </select>
          <select value={week ?? ""} onChange={(e) => setWeek(Number(e.target.value) || null)}>
            <option value="">選週次</option>
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>第 {n} 週</option>
            ))}
          </select>
        </div>
        <button className="btn-act setup-start" disabled={!grade || !week} onClick={() => setPhase('loading')}>
          🗡️ 開戰
        </button>
        <button className="btn-act setup-back" onClick={onBack}>← 返回</button>
      </div>
    );
  }

  const handleAnswer = (isCorrect: boolean) => {
    if (phase !== 'battle') return;

    if (isCorrect) {
      const now = Date.now();
      const isCombo = (now - lastTime) < 3000;
      const newCombo = isCombo ? combo + 1 : 1;
      setCombo(newCombo);
      setLastTime(now);

      let damage = 20 + (newCombo * 5);
      if (newCombo >= 3) damage *= 1.5;
      damage = Math.floor(damage);

      setMHP(prev => {
        const next = Math.max(0, prev - damage);
        if (next === 0) setPhase('victory');
        return next;
      });
      // 🤖 機器人射箭演出的時候順便讓怪物變色割血
      robotShoot(damage);
    } else {
      setCombo(0);
      setShake(true);
      setTimeout(() => setShake(false), 300);
      setPHP(prev => {
        const next = Math.max(0, prev - (monster?.attack_power || 10));
        if (next === 0) setPhase('defeat');
        return next;
      });
    }
    
    if (curr < questions.length - 1) setCurr(curr + 1);
    else if (mHP > 0) setPhase('defeat');
  };

  if (phase === 'loading') return <div className="battle-container">載入副本中...</div>;
  if (phase === 'battle' && questions.length === 0) {
    return (
      <div className="battle-container battle-setup">
        <h2>🌫️ 這個週次沒有單字</h2>
        <p className="setup-hint">換一個年級或週次再挑戰吧！</p>
        <button className="btn-act setup-back" onClick={onBack}>← 返回</button>
      </div>
    );
  }
  const q = questions[curr];

  return (
    <div className={`battle-container ${shake ? 'shake' : ''}`}>
      {phase === 'battle' ? (
        <>
          <div className="hud">
            <div>怪獸: {monster?.name} ({mHP}HP)</div>
            <div>玩家: ({pHP}HP) | 連擊: {combo}</div>
          </div>
          <div className="stage">
            <div className={`monster ${monHit ? "mon-hit" : ""}`} style={{ left: `${monPos.x}%`, top: `${monPos.y}%` }}>
              {monster?.image_url || '👾'}
            </div>
            {heroState !== "hidden" && (
              <div className={`hero-bot ${heroState}`} style={{ left: `${heroPos.x}%`, top: `${heroPos.y}%` }}>
                <div className="hb-robot">
                  <div className="hb-ant" />
                  <div className="hb-head">
                    <div className="hb-visor" />
                    <span className="hb-eye l" />
                    <span className="hb-eye r" />
                  </div>
                  <div className="hb-arm b" />
                  <div className="hb-quiver" />
                  <div className="hb-body" />
                  <div className="hb-arm f" />
                  <div className="hb-bow">
                    <div className="hb-string" />
                    <div className="hb-pull" />
                    <div className="hb-nocked" />
                  </div>
                  <div className="hb-leg l" />
                  <div className="hb-leg r" />
                  <div className="hb-flash" />
                </div>
              </div>
            )}
            {arrow && (
              <div className="arrow-run" style={{
                left: `${arrow.x + (arrow.fly ? arrow.dx : 0)}%`,
                top: `${arrow.y + (arrow.fly ? arrow.dy : 0)}%`,
                transform: `translate(-50%, -50%) rotate(${arrow.ang}deg)`
              }} />
            )}
            {dmg && <div className="damage-text" style={{ left: `${monPos.x}%`, top: `${monPos.y}%` }}>-{dmg.val}</div>}
          </div>
          <div className="actions">
            <h3>{q.word}</h3>
            <div className="qz-opt-grid">
              {q.options.map((opt: string) => (
                <button key={opt} className="btn-act" onClick={() => handleAnswer(opt === q.correct)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="result-screen">
          <h1>{phase === 'victory' ? '🎉 挑戰勝利！' : '💀 挑戰失敗...'}</h1>
          <button className="btn-act" onClick={onBack}>返回選單</button>
        </div>
      )}
    </div>
  );
}