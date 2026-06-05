import { Highlight, type PrismTheme } from "prism-react-renderer";

const THEME: PrismTheme = {
  plain: { color: "#dde1ea", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#6d6e80", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#a8a9b8" } },
    { types: ["property", "tag", "boolean", "number", "constant", "symbol", "deleted"], style: { color: "#fbbf24" } },
    { types: ["selector", "attr-name", "string", "char", "builtin", "inserted"], style: { color: "#86dcb1" } },
    { types: ["operator", "entity", "url"], style: { color: "#84b9e8" } },
    { types: ["atrule", "attr-value", "keyword"], style: { color: "#b4a8f0" } },
    { types: ["function", "class-name", "maybe-class-name"], style: { color: "#84b9e8", fontWeight: "500" } },
    { types: ["regex", "important", "variable"], style: { color: "#f0c062" } },
    { types: ["important", "bold"], style: { fontWeight: "bold" } },
    { types: ["italic"], style: { fontStyle: "italic" } },
  ],
};

export function CodeView({
  text,
  lang,
  startLine = 1,
}: {
  text: string;
  lang: string;
  startLine?: number;
}) {
  return (
    <Highlight theme={THEME} code={text} language={lang}>
      {({ className, tokens, getLineProps, getTokenProps }) => (
        <pre className={`codeview ${className}`}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })} className="codeview-line">
              <span className="codeview-line-num">{i + startLine}</span>
              <span className="codeview-line-content">
                {line.map((token, k) => (
                  <span key={k} {...getTokenProps({ token })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
