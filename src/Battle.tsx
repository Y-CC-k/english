import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import './Battle.css';

export default function Battle({ grade, week, onBack }: { grade: number, week: number, onBack: () => void }) {
  const [monster, setMonster] = useState<any>(null);
  const [mHP, setMHP] = useState(0);
  const [pHP, setPHP] = useState(100);
  const [phase, setPhase] = useState<'loading' | 'battle' | 'victory' | 'defeat'>('loading');
  const [questions, setQuestions] = useState<any[]>([]);
  const [curr, setCurr] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());
  const [shake, setShake] = useState(false);
  const [dmg, setDmg] = useState<{val: number} | null>(null);
  // 怪物位置（隨機漫步）與受擊變色
  const [monPos, setMonPos] = useState({ x: 50, y: 50 });
  const [monHit, setMonHit] = useState(false);

  // 戰鬥中怪物到處跑（每 1.3 秒換一個隨機位置）
  useEffect(() => {
    if (phase !== 'battle') return;
    setMonPos({ x: 50, y: 45 });
    const t = setInterval(() => {
      setMonPos({ x: 15 + Math.random() * 70, y: 10 + Math.random() * 55 });
    }, 1300);
    return () => clearInterval(t);
  }, [phase, curr]);

  useEffect(() => {
    async function init() {
      const sb = supabase();
      if (!sb) return;
      
      console.log("正在載入副本:", { grade, week });
      const { data: mData } = await sb.from('monsters').select('*').limit(1).single();
      const { data: wData } = await sb
        .from('words')
        .select('*')
        .eq('grade', grade)
        .eq('week', week)
        .limit(10);
        
      console.log("副本資料:", { mData, wData });
      if (mData) { setMonster(mData); setMHP(mData.max_hp); }
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
      setDmg({ val: damage });
      setTimeout(() => setDmg(null), 800);
      // 答對 → 怪物變色閃一下
      setMonHit(true);
      setTimeout(() => setMonHit(false), 450);
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
  const q = questions[curr] || { word: "無單字", options: [] };

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
            {dmg && <div className="damage-text">-{dmg.val}</div>}
          </div>
          <div className="actions">
            <h3>{q.word}</h3>
            {q.options?.map((opt: string) => (
              <button key={opt} className="btn-act" onClick={() => handleAnswer(opt === q.correct)}>
                {opt}
              </button>
            ))}
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