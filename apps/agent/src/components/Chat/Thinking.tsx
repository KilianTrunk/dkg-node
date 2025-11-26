import { useEffect, useRef, useState } from "react";

import ChatMessage from "./Message";

export default function ChatThinking({ speed = 250 }: { speed?: number }) {
  const [state, setState] = useState(0);

  const t = useRef<number | null>(null);
  useEffect(() => {
    t.current = setInterval(() => setState((state + 1) % 4), speed);

    return () => {
      if (t.current) clearInterval(t.current);
    };
  }, [state, speed]);

  const thinkingTexts = [
    "Consulting medical literature",
    "Reviewing case studies",
    "Analyzing research data",
    "Cross-referencing sources"
  ];

  return (
    <ChatMessage icon="assistant">
      <ChatMessage.Content
        content={{
          type: "text",
          text: thinkingTexts[state] + (state === 3 ? "..." : "."),
        }}
      />
    </ChatMessage>
  );
}
