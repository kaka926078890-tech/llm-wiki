import {
  type KeyboardEvent,
  type RefObject,
  useRef,
} from "react";

import { I } from "./icons";

export function Composer({
  draft,
  setDraft,
  onSend,
  onAbort,
  disabled,
  busy,
  textareaRef,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  onAbort: () => void;
  disabled?: boolean;
  busy?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const composingRef = useRef(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (busy) {
        onAbort();
      } else if (!disabled && draft.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="composer">
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder="Ask about middleware, web, or finclaw…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            rows={2}
            disabled={disabled}
          />
          <div className="composer-foot">
            <span className="grow" />
            {busy ? (
              <button
                type="button"
                className="send-btn"
                style={{ background: "var(--danger)" }}
                onClick={onAbort}
                title="Stop"
              >
                <I.stop size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                disabled={disabled || !draft.trim()}
                onClick={() => {
                  if (!disabled && draft.trim()) onSend();
                }}
              >
                <I.send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
