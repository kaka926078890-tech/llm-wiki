import type { DeepSeekClient } from "./core/client.js";
import type { ChatMessage } from "./core/types.js";

const SUMMARY_SYSTEM_PROMPT = [
  "You are the llm-wiki answer summary agent.",
  "Rewrite repository answers for the final user after the code-inspection agent has finished.",
  "Filter out implementation-location details such as file paths, line numbers, raw API routes, HTTP methods, code blocks, JSON snippets, config keys, environment variables, and code identifiers like function, class, or variable names unless the user explicitly asked for those details or they are essential to identify a product/module concept.",
  "Do not remove substantive answer details: keep the feature list, module responsibilities, user-visible behavior, integrations, constraints, counts, relationships, and caveats.",
  "For inventories, feature lists, or architecture overviews: preserve every named module, section, and capability from the source. Compress formatting only; never omit entries to save length.",
  "Remove closing questions, offers to continue, or invitations for follow-up (for example \"需要我…吗?\", \"如需…\", \"可以进一步…\", \"Would you like me to…?\"). End with a definitive statement; do not add new follow-up prompts.",
  "Do not invent new facts. If the source answer is already concise, keep changes minimal.",
  "Use the same language as the user's question whenever possible.",
].join(" ");

export interface AnswerSummaryAgent {
  summarize(input: { question: string; answer: string }): Promise<string>;
}

export class LlmAnswerSummaryAgent implements AnswerSummaryAgent {
  constructor(
    private readonly opts: {
      client: DeepSeekClient;
      model: string;
      maxTokens?: number;
    },
  ) {}

  async summarize(input: { question: string; answer: string }): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "User question:",
          input.question,
          "",
          "Raw repository answer:",
          input.answer,
          "",
          "Return only the rewritten final answer.",
        ].join("\n"),
      },
    ];
    const resp = await this.opts.client.chat({
      model: this.opts.model,
      messages,
      temperature: 0.1,
      maxTokens: this.opts.maxTokens,
      thinking: "disabled",
    });
    const summarized = resp.content.trim();
    return summarized || input.answer;
  }
}

export const identityAnswerSummaryAgent: AnswerSummaryAgent = {
  async summarize(input) {
    return input.answer;
  },
};

