import { memo, useEffect, useState } from "react";

import type { AssistantSegment } from "../lib/loop-types";
import {
  answerFromSegments,
  cleanStreamedAnswer,
  hasSubstantiveAnswer,
  resolveAnswerForSave,
} from "../lib/answer-text";
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
  evidenceSummary,
  runId,
  onSaveKnowledge,
  saveDisabled,
  saveLabel,
}: {
  segments: AssistantSegment[];
  pending: boolean;
  evidenceSummary?: string;
  runId?: string;
  onSaveKnowledge?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  const streamedAnswer = answerFromSegments(segments);
  const [hydratedAnswer, setHydratedAnswer] = useState<string | null>(null);

  useEffect(() => {
    if (pending || hasSubstantiveAnswer(streamedAnswer) || !runId) {
      setHydratedAnswer(null);
      return;
    }
    let cancelled = false;
    void resolveAnswerForSave({ segments, runId }).then((answer) => {
      if (!cancelled && hasSubstantiveAnswer(answer)) setHydratedAnswer(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [pending, runId, segments, streamedAnswer]);

  const answerText =
    (hasSubstantiveAnswer(streamedAnswer) ? streamedAnswer : "")
    || hydratedAnswer
    || streamedAnswer;
  const toolSegments = segments.filter(
    (segment): segment is Extract<AssistantSegment, { kind: "tool" }> => segment.kind === "tool",
  );
  const reasoningSegments = segments.filter(
    (segment): segment is Extract<AssistantSegment, { kind: "reasoning" }> =>
      segment.kind === "reasoning",
  );

  return (
    <div className="msg assistant">
      <div className="body">
        {reasoningSegments.map((s, i) => (
          <ReasoningCard
            key={`reasoning-${i}`}
            text={s.text}
            streaming={pending && i === reasoningSegments.length - 1}
          />
        ))}
        {toolSegments.length > 0 ? (
          <details className="tools-group" open={pending}>
            <summary className="tools-group__summary">
              <span className="tools-group__label">tools</span>
              <span className="tools-group__count">{toolSegments.length} calls</span>
              <span className="tools-group__hint">
                {pending ? "running…" : "completed — expand to inspect"}
              </span>
            </summary>
            <div className="tools-group__list">
              {toolSegments.map((s, i) => (
                <ToolCard
                  key={`${s.callId}-${i}`}
                  name={s.name}
                  args={s.args}
                  result={s.result}
                  ok={s.ok}
                  defaultOpen={pending && s.result === undefined}
                />
              ))}
            </div>
          </details>
        ) : null}
        {pending
          ? segments
              .filter((s): s is Extract<AssistantSegment, { kind: "text" }> => s.kind === "text")
              .map((s, i) => (
                <AssistantText key={`stream-${i}`} text={cleanStreamedAnswer(s.text) || s.text} />
              ))
          : null}
        {answerText && !pending ? (
          <div className="assistant-answer">
            <AssistantText text={answerText} />
          </div>
        ) : null}
        {evidenceSummary && !pending ? (
          <p className="evidence-meta">{evidenceSummary}</p>
        ) : null}
        {onSaveKnowledge && hasSubstantiveAnswer(answerText) && !pending ? (
          <div className="knowledge-save">
            <button type="button" onClick={onSaveKnowledge} disabled={saveDisabled}>
              {saveDisabled ? saveLabel ?? "Saved" : "Save as knowledge"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
