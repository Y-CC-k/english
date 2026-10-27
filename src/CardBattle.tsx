import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import './CardBattle.css';

type Attr = 'fire' | 'water' | 'wood';
type Rarity = 'R' | 'SR' | 'SSR';

const ATTR_EMOJI: Record<Attr, string> = { fire: '🔥', water: '💧', wood: '🌿' };
// 克制：水剋火、火剋木、木剋水
const WEAK_TO: Record<Attr, Attr> = { fire: 'water', water: 'wood', wood: 'fire' };
const RARITY_MULT: Record<Rarity, number> = { R: 1, SR: 1.35, SSR: 1.9 };
const RARITY_LABEL: Record<Rarity, string> = { R: 'R', SR: 'SR', SSR: 'SSR' };

const MONSTERS = [
  { name: '炎龍王', emoji: '🐉', attr: 'fire' as Attr, hp: 220, atk: 18 },
  { name: '水元素', emoji: '🐙', attr: 'water' as Attr, hp: 180, atk: 14 },
  { name: '樹人', emoji: '🌳', attr: 'wood' as Attr, hp: 200, atk: 16 },
  { name: '暗黑騎士', emoji: '⚔️', attr: 'fire' as Attr, hp: 260, atk: 20 },
  { name: '冰霜巨獸', emoji: '🧊', attr: 'water' as Attr, hp: 240, atk: 17 },
  { name: '荆棘魔女', emoji: '🌹', attr: 'wood' as Attr, hp: 210, atk: 19 },
];

interface Q { word: string; chinese: string; listen: boolean; options: string[]; attr: Attr; rarity: Rarity; correct: string; }

function pickRarity(): Rarity {
  const r = Math.random();
  if (r < 0.12) return 'SSR';
  if (r < 0.42) return 'SR';
  return 'R';
}

export default function CardBattle({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<'setup' | 'loading' | 'battle' | 'victory' | 'defeat'>('setup');
  const [grade, setGrade] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);

  const [monster, setMonster] = useState<any>(null);
  const [mHP, setMHP] = useState(0);
  const [pHP, setPHP] = useState(100);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [curr, setCurr] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());
  const [dmg, setDmg] = useState<number | null>(null);
  const [monHit, setMonHit] = useState(false);
  const [shake, setShake] = useState(false);
  const [cardThrust, setCardThrust] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [monPos, setMonPos] = useState({ x: 50, y: 48 });

  useEffect(() => {
    if (phase !== 'battle') return;
    const t = setInterval(() => {
      setMonPos({ x: 28 + Math.random() * 44, y: 38 + Math.random() * 22 });
    }, 1500);
    return () => clearInterval(t);
  }, [phase]);

  async function startBattle() {
    if (!grade || !week) return;
    setPhase('loading');
    const sb = supabase();
    if (!sb) { setPhase('setup'); return; }
    const { data: wData } = await sb.from('words').select('*').eq('grade', grade).eq('week', week).limit(12);
    if (!wData || wData.length === 0) { setPhase('setup'); alert('這個週次沒有單字'); return; }
    const m = { ...MONSTERS[Math.floor(Math.random() * MONSTERS.length)] };
    const lvl = grade - 3;
    m.hp = m.hp + lvl * 30; m.atk = m.atk + lvl * 2;
    setMonster(m); setMHP(m.hp);

    const allCn = [...new Set(wData.map((r: any) => r.chinese))];
    const allWd = [...new Set(wData.map((r: any) => r.word))];
    const qs: Q[] = wData.map((w: any) => {
      const attr: Attr = (['fire','water','wood'] as Attr[])[Math.floor(Math.random() * 3)];
      const rarity = pickRarity();
      const listen = Math.random() < 0.5;
      const correct = listen ? w.chinese : w.word;
      const pool = listen ? allCn : allWd;
      const distractors = shuffle(pool.filter((x: string) => x !== correct)).slice(0, 3);
      const options = shuffle(distractors.concat(correct));
      return { word: w.word, chinese: w.chinese, listen, options, attr, rarity, correct };
    });
    setQuestions(qs); setTotal(qs.length); setCurr(0); setScore(0); setCombo(0);
    setPHP(100); setPhase('battle');
  }

  function shuffle<T>(a: T[]): T[] { return a.slice().sort(() => Math.random() - 0.5); }

  function handleAnswer(option: string) {
    if (chosen) return;
    if (!questions[curr]) return;
    const q = questions[curr];
    const correct = option === q.correct;
    setChosen(option);
    if (correct) {
      const now = Date.now();
      const isCombo = now - lastTime < 3000;
      const newCombo = isCombo ? combo + 1 : 1;
      setCombo(newCombo);
      setLastTime(now);
      // 弱點：卡片屬性 == 怪物弱點 → 2 倍傷害
      const weak = WEAK_TO[monster.attr as Attr] === q.attr;
      let damage = Math.round(15 * RARITY_MULT[q.rarity] * (weak ? 2 : 1) + newCombo * 4);
      if (newCombo >= 3) damage = Math.round(damage * 1.4);
      setCardThrust(true);
      setTimeout(() => setCardThrust(false), 420);
      setMHP(prev => {
        const next = Math.max(0, prev - damage);
        if (next === 0) setTimeout(() => setPhase('victory'), 600);
        return next;
      });
      setDmg(damage);
      setMonHit(true);
      setTimeout(() => { setDmg(null); setMonHit(false); }, 900);
      setScore(s => s + 1);
    } else {
      setCombo(0);
      setShake(true);
      setTimeout(() => setShake(false), 320);
      setPHP(prev => {
        const next = Math.max(0, prev - monster.atk);
        if (next === 0) setTimeout(() => setPhase('defeat'), 400);
        return next;
      });
    }
    setTimeout(() => {
      setChosen(null);
      if (curr + 1 < questions.length) setCurr(c => c + 1);
      else if (mHP > 0) setPhase('defeat');
    }, 1200);
  }

  if (phase === 'setup') {
    return (
      <div className="cb-root cb-setup">
        <button className="cb-back" onClick={onBack}>← 返回</button>
        <h1 className="cb-title">🃏 卡牌戰鬥</h1>
        <p className="cb-sub">日系奇幻風格 · 屬性克制 · 稀有度暴擊</p>
        <div className="cb-setup-row">
          <select value={grade ?? ''} onChange={e => setGrade(Number(e.target.value) || null)}>
            <option value="">選年級</option>
            <option value="3">三年級</option>
            <option value="4">四年級</option>
            <option value="5">五年級</option>
            <option value="6">六年級</option>
          </select>
          <select value={week ?? ''} onChange={e => setWeek(Number(e.target.value) || null)}>
            <option value="">選週次</option>
            {Array.from({ length: 36 }, (_, i) => i + 1).map(n => <option key={n} value={n}>第 {n} 週</option>)}
          </select>
        </div>
        <button className="cb-start" disabled={!grade || !week} onClick={startBattle}>🗡️ 開戰</button>
      </div>
    );
  }
  if (phase === 'loading') return <div className="cb-root cb-loading">召喚卡牌中…</div>;
  const q = questions[curr];
  const weak = q ? WEAK_TO[monster.attr as Attr] === q.attr : false;

  return (
    <div className={`cb-root ${shake ? 'cb-shake' : ''}`}>
      {/* ── 頂：玩家 vs 怪物 ── */}
      <div className="cb-hud">
        <div className="cb-side cb-player">
          <div className="cb-avatar">🧙‍♂️</div>
          <div className="cb-info">
            <div className="cb-name">玩家</div>
            <div className="cb-hpbar"><div className="cb-hpfill cb-hpfill-p" style={{ width: `${pHP}%` }} /></div>
            <div className="cb-hptext">HP {pHP}/100 · Combo {combo}</div>
          </div>
        </div>
        <div className="cb-vs">VS</div>
        <div className="cb-side cb-enemy">
          <div className="cb-info cb-info-r">
            <div className="cb-name">{monster.name} {ATTR_EMOJI[monster.attr as Attr]}</div>
            <div className="cb-hpbar"><div className="cb-hpfill cb-hpfill-e" style={{ width: `${(mHP / monster.hp) * 100}%` }} /></div>
            <div className="cb-hptext">HP {mHP}/{monster.hp}</div>
          </div>
          <div className="cb-avatar cb-avatar-e" style={{ transform: `translate(${monPos.x - 50}px, ${monPos.y - 48}px)` }}>
            {monster.emoji}
          </div>
        </div>
      </div>

      {/* ── 中：戰場 ── */}
      <div className="cb-stage">
        <div className={`cb-monster ${monHit ? 'cb-mon-hit' : ''}`}>{monster.emoji}</div>
        {dmg !== null && <div className="cb-dmg">-{dmg}{weak ? ' 💥' : ''}</div>}
        {/* 卡牌（題目） */}
        {q && (
          <div className={`cb-card cb-card-${q.rarity.toLowerCase()} ${cardThrust ? 'cb-card-thrust' : ''}`}>
            <div className="cb-card-shine" />
            <div className="cb-card-top">
              <span className="cb-card-attr">{ATTR_EMOJI[q.attr]}</span>
              <span className="cb-card-rarity">{RARITY_LABEL[q.rarity]}</span>
            </div>
            <div className="cb-card-word">{q.word}</div>
            <div className="cb-card-pos">{q.chinese}</div>
            <div className="cb-card-hint">{q.listen ? '🎧 聽音選義' : '🔍 看義選詞'}</div>
            {weak && <div className="cb-card-weak">弱點 ×2</div>}
          </div>
        )}
      </div>

      {/* ── 下：答題 ── */}
      <div className="cb-actions">
        <div className="cb-prompt">這個單字的意思是？</div>
        <div className="cb-opts">
          {q?.options.map((o, i) => (
            <button key={i} className={`cb-opt ${chosen === o ? (o === q.correct ? 'cb-opt-ok' : 'cb-opt-ng') : ''} ${chosen && o === q.correct ? 'cb-opt-ok' : ''}`}
              disabled={!!chosen} onClick={() => handleAnswer(o)}>
              {o}
            </button>
          ))}
        </div>
        <div className="cb-score">得分 {score}/{total} · {grade} 年級 第 {week} 週</div>
      </div>

      {(phase === 'victory' || phase === 'defeat') && (
        <div className="cb-result">
          <h1>{phase === 'victory' ? '🏆 挑戰勝利！' : '💀 挑戰失敗...'}</h1>
          <p>答對 {score} / {total} 題</p>
          <button className="cb-start" onClick={onBack}>返回</button>
        </div>
      )}
    </div>
  );
}