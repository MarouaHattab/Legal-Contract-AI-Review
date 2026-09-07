import ReactMarkdown from "react-markdown";
import { useTypewriter } from "../hooks/useTypewriter";

export function TypewriterText({
  text,
  animationKey,
  compact = false,
}: {
  text: string;
  animationKey: string;
  compact?: boolean;
}) {
  const shown = useTypewriter(text, animationKey);
  return (
    <div className={compact ? "markdown compact" : "markdown"}>
      <ReactMarkdown>{shown}</ReactMarkdown>
    </div>
  );
}
