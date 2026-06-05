import { memo } from "react";

import type { AssistantSegment } from "../lib/loop-types";
import { AssistantText, ReasoningCard, ToolCard } from "./cards";

export const UserMsg = memo(function UserMsg({ text }: { text: string }) {
  return (
    <div className="msg user">
      <div className="body">
        <div className="msg-text">{text}</div>
      </div>
    </div>
  );
});

export const AssistantMsg = memo(function AssistantMsg({
  segments,
  pending,
}: {
  segments: AssistantSegment[];
  pending: boolean;
}) {
  return (
    <div className="msg assistant">
      <div className="body">
        {segments.map((s, i) => {
          if (s.kind === "text") {
            if (!s.text.trim()) return null;
            return <AssistantText key={i} text={s.text} />;
          }
          if (s.kind === "reasoning") {
            return (
              <ReasoningCard
                key={i}
                text={s.text}
                streaming={pending && i === segments.length - 1}
              />
            );
          }
          return (
            <ToolCard
              key={i}
              name={s.name}
              args={s.args}
              result={s.result}
              ok={s.ok}
            />
          );
        })}
      </div>
    </div>
  );
});
