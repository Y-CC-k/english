/**
 * 瀏覽器內建語音合成（Web Speech API）— 單字／例句發音
 *
 * 不需要任何音檔：Chrome／Edge 都支援，Windows 預設就有英文語音。
 * 之後若補了真人 mp3，可加「先播檔、沒檔才 TTS」的升級路徑。
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

/** 使用者自選語音（存在 localStorage，跨頁面保留） */
const VOICE_PREF_KEY = "ws-voice-name";
let preferredVoiceName: string | null = null;
try {
  preferredVoiceName = window.localStorage.getItem(VOICE_PREF_KEY);
} catch {
  /* localStorage 不可用就算了 */
}

/** 選定語音（null = 回自動挑選）。選了不存在的名稱會自動退回自動模式。 */
export function setPreferredVoice(name: string | null): void {
  preferredVoiceName = name;
  cachedVoice = undefined;
  try {
    if (name) window.localStorage.setItem(VOICE_PREF_KEY, name);
    else window.localStorage.removeItem(VOICE_PREF_KEY);
  } catch {
    /* ignore */
  }
}

export function getPreferredVoiceName(): string | null {
  return preferredVoiceName;
}

/** 列出本機所有英文語音（給語音選單用）。 */
export function listEnglishVoices(): Array<{ name: string; lang: string; local: boolean }> {
  return (window.speechSynthesis?.getVoices() ?? [])
    .filter((v) => /^en(-|_)?/i.test(v.lang))
    .map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
}

/** 挑一個合适的英文語音：使用者選定 > 自動順位。 */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => /^en(-|_)?/i.test(v.lang));
  if (preferredVoiceName) {
    const chosen = en.find((v) => v.name === preferredVoiceName);
    if (chosen) {
      cachedVoice = chosen;
      return chosen;
    }
    // 選的語音在這台機器不存在（換了電腦）→ 退回自動
    preferredVoiceName = null;
  }
  cachedVoice =
    en.find((v) => /google us english/i.test(v.name)) ??
    en.find((v) => /microsoft.*(zira|david|aria|jenny)/i.test(v.name)) ??
    en.find((v) => /google/i.test(v.name)) ??
    en.find((v) => /microsoft/i.test(v.name)) ??
    en[0] ??
    null;
  return cachedVoice;
}

/** 語音清單是異步載入的：voiceschanged 事件 + 輪詢雙保險（iPad Safari 不一定觸發事件）。 */
export function ensureVoice(onReady?: () => void): void {
  if (pickEnglishVoice() ?? null) return;
  const v = window.speechSynthesis;
  if (!v) return;
  v.addEventListener(
    "voiceschanged",
    () => {
      cachedVoice = undefined;
      pickEnglishVoice();
      onReady?.();
    },
    { once: true },
  );
  // iOS/iPadOS Safari：voices 清單常要幾百 ms～數秒才填入，用輪詢兜底
  let tries = 0;
  const timer = window.setInterval(() => {
    tries++;
    cachedVoice = undefined;
    if (pickEnglishVoice() ?? null) {
      window.clearInterval(timer);
      onReady?.();
    } else if (tries > 12) {
      window.clearInterval(timer); // 約 3 秒仍無 → 放棄（畫面會走「沒有英文語音」提示）
    }
  }, 250);
}

/**
 * iOS/iPadOS Safari 首次語音合成必須發生在使用者手勢之後。
 * 在第一次 pointerdown 時偷偷播一個靜音音節「暖機」，之後的自動播音就會正常。
 */
let primed = false;
function primeSpeech(): void {
  if (primed || !isSpeechSupported()) return;
  primed = true;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
  synth.cancel();
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  document.addEventListener("pointerdown", primeSpeech, { once: true, capture: true });
  document.addEventListener("keydown", primeSpeech, { once: true, capture: true });
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 目前實際會用哪個語音（給畫面顯示用；找不到英文語音時回 null）。 */
export function currentEnglishVoiceName(): string | null {
  return pickEnglishVoice()?.name ?? null;
}

function utter(text: string, rate: number): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const v = pickEnglishVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  return u;
}

/** 念單字：語速稍慢，讓小學生聽清楚。 */
export function speakWord(word: string, rate = 0.85): void {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.speak(utter(word, rate));
}

/** 念例句：語速正常一點。 */
export function speakSentence(sentence: string): void {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.speak(utter(sentence, 0.95));
}

/** 依序念一串（單字→停頓→例句），中間不互相打斷；結束或超時才 resolve。 */
export function speakSequence(
  parts: ReadonlyArray<{ text: string; rate?: number }>,
  gapMs = 350,
): Promise<void> {
  if (!isSpeechSupported()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  return new Promise((resolve) => {
    // 任何一段遺失 onend 事件也要解脫（瀏覽器 bug 產險）
    const guard = window.setTimeout(() => done(), 15000);
    function done() {
      window.clearTimeout(guard);
      resolve();
    }
    const play = (i: number) => {
      if (i >= parts.length) return;
      const { text, rate = 0.85 } = parts[i];
      const u = utter(text, rate);
      u.onend = () => {
        if (i + 1 < parts.length) window.setTimeout(() => play(i + 1), gapMs);
        else done();
      };
      u.onerror = () => done();
      synth.speak(u);
    };
    play(0);
  });
}

/** 停掉目前所有播音（教學模式退出／畫面切換用）。 */
export function stopSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
