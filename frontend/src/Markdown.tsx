import { Check, Copy, FileText } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  type ReactNode,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { CodeView } from "./CodeView";

const KNOWN_EXTS =
  "ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi|rs|go|json|jsonc|md|mdx|css|scss|less|html|htm|xml|svg|yaml|yml|toml|sh|bash|zsh|fish|sql|rb|java|kt|swift|c|cpp|cc|cxx|h|hpp|hxx|cs|php|lua|dart|ex|exs|erl|hs|clj|cljs|zig|vue|svelte|graphql|gql|proto";

const FILE_PATH_RE = new RegExp(
  `(^|[\\s\`'"(\\[])((?:[\\w.-]+\\/)+[\\w.-]+\\.(?:${KNOWN_EXTS}))(?::(\\d+(?:-\\d+)?))?(?=[\\s.,;!?\\]\\)'"\`]|$)`,
  "g",
);

function FilePill({ path, line }: { path: string; line?: string }) {
  const [done, setDone] = useState(false);
  const display = line ? `${path}:${line}` : path;
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(display);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <span
      className={`file-pill ${done ? "done" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => void onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onClick();
        }
      }}
      title="Copy path"
    >
      <FileText size={10} className="file-pill-icon" />
      <span className="file-pill-path">{path}</span>
      {line ? <span className="file-pill-line">:{line}</span> : null}
      {done ? <Check size={10} className="file-pill-check" /> : null}
    </span>
  );
}

function splitFilePaths(text: string): ReactNode[] | string {
  FILE_PATH_RE.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null = FILE_PATH_RE.exec(text);
  while (m !== null) {
    const prefix = m[1] ?? "";
    const path = m[2]!;
    const line = m[3];
    const pillStart = m.index + prefix.length;
    if (pillStart > last) out.push(text.slice(last, pillStart));
    out.push(<FilePill key={`fp-${pillStart}`} path={path} line={line} />);
    last = pillStart + path.length + (line ? line.length + 1 : 0);
    m = FILE_PATH_RE.exec(text);
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type AnyProps = { children?: ReactNode } & Record<string, unknown>;

function withFilePills(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return splitFilePaths(child);
    if (isValidElement(child)) {
      const props = child.props as AnyProps;
      if (props.children !== undefined) {
        return cloneElement(child, undefined, withFilePills(props.children));
      }
    }
    return child;
  });
}

function extractFencedLang(children: ReactNode): string {
  for (const kid of Children.toArray(children)) {
    if (isValidElement(kid)) {
      const cls = (kid.props as Record<string, unknown>).className;
      if (typeof cls === "string") {
        const match = cls.match(/language-([\w-]+)/);
        if (match) return match[1]!;
      }
    }
  }
  return "text";
}

function flattenChildText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildText).join("");
  if (isValidElement(node)) {
    return flattenChildText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="codeblock-lang">{lang}</span>
        <button type="button" className={`copy-btn ${copied ? "done" : ""}`} onClick={() => void onCopy()}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <CodeView text={text} lang={lang} />
    </div>
  );
}

export const Markdown = memo(function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre: ({ children }) => {
            const rawText = flattenChildText(children).trimEnd();
            return <CodeBlock lang={extractFencedLang(children)} text={rawText} />;
          },
          code: ({ className, children }) => <code className={className}>{children}</code>,
          a: ({ href, children }) => (
            <a href={href ?? "#"} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          p: ({ children }) => <p>{withFilePills(children)}</p>,
          li: ({ children }) => <li>{withFilePills(children)}</li>,
          td: ({ children }) => <td>{withFilePills(children)}</td>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
