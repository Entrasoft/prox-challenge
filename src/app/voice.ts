"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Speech-to-text via the Web Speech API (no second vendor key). */
export function useSpeechInput(onText: (t: string) => void) {
  // Read the browser capability without a hydration mismatch (false on the server).
  const supported = useSyncExternalStore(
    noop,
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const toggle = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      onText(t);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [onText]);

  return { supported, listening, toggle };
}

/** Text-to-speech for answers (browser voice). */
export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}
export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
