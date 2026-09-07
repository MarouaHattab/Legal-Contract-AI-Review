import { useEffect, useState } from "react";
import { useStore } from "../state/store";

export function useTypewriter(text: string, key: string): string {
  const { isTyped, markTyped } = useStore();
  const already = isTyped(key);
  const [shown, setShown] = useState(already ? text : "");

  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    if (isTyped(key)) {
      setShown(text);
      return;
    }
    let index = 0;
    const step = Math.max(8, Math.ceil(text.length / 20));
    const timer = window.setInterval(() => {
      index += step;
      if (index >= text.length) {
        setShown(text);
        markTyped(key);
        window.clearInterval(timer);
      } else {
        setShown(text.slice(0, index));
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [isTyped, key, markTyped, text]);

  return shown;
}
