/**
 * 瀏覽器內建語音合成（Web Speech API）— 單字／例句發音
 *
 * 不需要任何音檔：Chrome／Edge 都支援，Windows 預設就有英文語音。
 * 之後若補了真人 mp3，可加「先播檔、沒檔才 TTS」的升級路徑。
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

/** 挑一個合适的英文語音（優先 Google / Microsoft 美式，再退回任何 en-*）。 */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => /^en(-|_)?/i.test(v.lang));
  cachedVoice =
    en.find((v) => /google us english/i.test(v.name)) ??
    en.find((v) => /microsoft.*(zira|david|aria|jenny)/i.test(v.name)) ??
    en.find((v) => /google/i.test(v.name)) ??
    en.find((v) => /microsoft/i.test(v.name)) ??
    en[0] ??
    null;
  return cachedVoice;
}

/** 語音清單是異步載入的：第一次查不到就等 voiceschanged 事件再試。 */
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
