import { memo, useState, type ReactNode } from "react";

import { Markdown } from "../Markdown";
import { I } from "./icons";

type Tone = "default" | "success" | "warning" | "danger" | "accent" | "violet";

export function Card({
  tone = "default",
  icon,
  kind,
  name,
  meta,
  defaultOpen = true,
  compact = false,
  children,
}: {
  tone?: Tone;
  icon: ReactNode;
  kind: string;
  name?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={compact ? "card is-compact" : "card"} data-tone={tone} data-open={open}>
      <button
        type="button"
        className="card-head"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span className="ico">{icon}</span>
        <span className="kind">{kind}</span>
        {name ? <span className="name">{name}</span> : null}
        <span className="grow" />
        {meta ? <span className="meta">{meta}</span> : null}
        <span className="chev">
          <I.chev size={12} />
        </span>
      </button>
      {open ? <div className="card-body">{children}</div> : null}
    </div>
  );
}

function StatusIcon({ state }: { state: "running" | "done" | "failed" }) {
  if (state === "running") {
    return <span className="spin-meta" role="img" aria-label="Running" />;
  }
  if (state === "failed") {
    return <I.x size={10} style={{ color: "var(--danger)" }} aria-label="Failed" />;
  }
  return <I.check size={10} style={{ color: "var(--success)" }} aria-label="Done" />;
}

export function ReasoningCard({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <Card
      tone="violet"
      icon={<I.brain size={12} />}
      kind="reasoning"
      name="Thinking"
      meta={
        streaming ? (
          <StatusIcon state="running" />
        ) : (
          <StatusIcon state="done" />
        )
      }
      defaultOpen={streaming}
      compact
    >
      <div className="reason">
        <div className="stream">
          {text.split(/\n\n+/).map((para, i) => (
            <p
              key={i}
              dangerouslySetInnerHTML={{
                __html: para
                  .replace(/`([^`]+)`/g, '<span class="hl">$1</span>')
                  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

export function ToolCard({
  name,
  args,
  result,
  ok,
}: {
  name: string;
  args?: string;
  result?: string;
  ok?: boolean;
}) {
  const running = result === undefined;
  const tone: Tone = running ? "default" : ok === false ? "danger" : "success";
  return (
    <Card
      tone={tone}
      icon={<I.wrench size={12} />}
      kind="tool"
      name={name}
      defaultOpen={false}
      compact
      meta={
        running ? (
          <StatusIcon state="running" />
        ) : ok === false ? (
          <StatusIcon state="failed" />
        ) : (
          <StatusIcon state="done" />
        )
      }
    >
      <div className="tool-call">
        {args ? (
          <div className="row">
            <span className="k">args</span>
            <span className="v">
              <span className="str">{args.length > 600 ? `${args.slice(0, 600)}…` : args}</span>
            </span>
          </div>
        ) : null}
        {result !== undefined ? (
          <div className="row">
            <span className="k">{ok === false ? "error" : "result"}</span>
            <span className="v">
              <span className={ok === false ? "num" : "str"}>
                {result.length > 1200 ? `${result.slice(0, 1200)}…` : result}
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export const AssistantText = memo(function AssistantText({ text }: { text: string }) {
  return (
    <div className="msg-text">
      <Markdown source={text} />
    </div>
  );
});
