import type { APIRoute } from "astro";
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { AGENT_CONFIG, buildSystemPrompt, shouldRefuse } from "../../lib/advisor/agent";
import { TOOL_MAP, openAIToolSpecs } from "../../lib/advisor/tools";
import type { ToolContext } from "../../lib/advisor/tools";
import type { Client, ChatMessage } from "../../lib/advisor/types";
import { appendAudit, estimateCost } from "../../lib/advisor/audit";
import { activeProvider, getLLM } from "../../lib/advisor/llm";

export const prerender = false;

type RequestBody = {
  messages: Array<Pick<ChatMessage, "role" | "content">>;
  client?: Client;
  conversationId?: string;
};

type StreamEvent =
  | { type: "start"; id: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_args"; id: string; args: string }
  | { type: "tool_result"; id: string; name: string; result: string; error?: string }
  | { type: "source"; source: { id: string; title: string; url?: string; snippet: string } }
  | { type: "pending_note"; note: string; tags?: string[] }
  | {
      type: "pending_email";
      draft: {
        subject: string;
        body: string;
        tone: "formal" | "friendly" | "concise";
        to?: string;
        cc?: string[];
      };
    }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      model: string;
      durationMs: number;
    }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

export const POST: APIRoute = async ({ request, locals }) => {
  const openai = getLLM();
  if (!openai) {
    return new Response(
      JSON.stringify({
        error:
          "No LLM API key set on the server. Set GROQ_API_KEY (preferred) or OPENAI_API_KEY in the environment and restart.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const provider = activeProvider();

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const refusal = shouldRefuse(lastUser.content);
    if (refusal) {
      return streamRefusal(refusal);
    }
  }


  const convo: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(body.client) },
    ...(body.messages ?? []).map<ChatCompletionMessageParam>((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const ctx: ToolContext = {
    client: body.client,
    pendingNotes: [],
    citedSources: [],
    pendingEmails: [],
  };

  const encoder = new TextEncoder();
  const seenSourceIds = new Set<string>();
  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolTimings: Array<{ name: string; durationMs: number; error?: string }> = [];

  const tenant = {
    orgId: locals.org?.id,
    orgName: locals.org?.name,
    userId: locals.user?.id,
    userEmail: locals.user?.email,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      send({ type: "start", id: crypto.randomUUID() });

      try {
        for (let round = 0; round < AGENT_CONFIG.maxToolRounds; round++) {
          const completion = await openai.chat.completions.create({
            model: AGENT_CONFIG.model,
            temperature: AGENT_CONFIG.temperature,
            messages: convo,
            tools: openAIToolSpecs(),
            stream: true,
            stream_options: { include_usage: true },
          });

          // Accumulate tool calls across the stream.
          type AccTool = { id: string; name: string; args: string; announced: boolean };
          const toolAcc: Record<number, AccTool> = {};
          let assistantText = "";
          let finishReason: string | null = null;

          for await (const chunk of completion) {
            if (chunk.usage) {
              totalInputTokens += chunk.usage.prompt_tokens ?? 0;
              totalOutputTokens += chunk.usage.completion_tokens ?? 0;
            }
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta as {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };

            if (delta.content) {
              assistantText += delta.content;
              send({ type: "token", text: delta.content });
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                const slot = (toolAcc[idx] ??= { id: "", name: "", args: "", announced: false });
                if (tc.id) slot.id = tc.id;
                if (tc.function?.name) slot.name = tc.function.name;
                if (tc.function?.arguments) slot.args += tc.function.arguments;

                if (!slot.announced && slot.id && slot.name) {
                  slot.announced = true;
                  send({ type: "tool_start", id: slot.id, name: slot.name });
                }
                if (slot.announced && tc.function?.arguments) {
                  send({ type: "tool_args", id: slot.id, args: tc.function.arguments });
                }
              }
            }

            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          const toolCallsArr = Object.keys(toolAcc)
            .map(Number)
            .sort((a, b) => a - b)
            .map((i) => toolAcc[i])
            .filter((t): t is AccTool => !!t && !!t.id && !!t.name);

          // If no tool calls, we're done — emit usage, done, record audit, and exit.
          if (toolCallsArr.length === 0) {
            const durationMs = Date.now() - startedAt;
            const costUsd = estimateCost(AGENT_CONFIG.model, totalInputTokens, totalOutputTokens);
            send({
              type: "usage",
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: totalInputTokens + totalOutputTokens,
              costUsd,
              model: AGENT_CONFIG.model,
              durationMs,
            });
            send({ type: "done", finishReason: finishReason ?? "stop" });
            controller.close();
            await appendAudit({
              id: crypto.randomUUID(),
              ts: new Date().toISOString(),
              ...tenant,
              clientId: body.client?.id,
              clientName: body.client?.name,
              conversationLength: body.messages?.length ?? 0,
              model: AGENT_CONFIG.model,
              userMessage: lastUser?.content.slice(0, 500) ?? "",
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: totalInputTokens + totalOutputTokens,
              toolCalls: toolTimings,
              durationMs,
              finishReason: finishReason ?? "stop",
              estCostUsd: costUsd,
            });
            return;
          }

          // Push assistant message with tool calls back into the convo.
          convo.push({
            role: "assistant",
            content: assistantText || null,
            tool_calls: toolCallsArr.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: t.args || "{}" },
            })),
          });

          // Execute tools in parallel, stream results as they finish.
          await Promise.all(
            toolCallsArr.map(async (t) => {
              const def = TOOL_MAP[t.name];
              let resultStr = "";
              let errMsg: string | undefined;
              const toolStart = Date.now();
              if (!def) {
                errMsg = `Unknown tool: ${t.name}`;
                resultStr = JSON.stringify({ error: errMsg });
              } else {
                try {
                  const parsedArgs = def.schema.parse(t.args ? JSON.parse(t.args) : {});
                  const result = await def.run(parsedArgs, ctx);
                  resultStr = JSON.stringify(result);
                } catch (err) {
                  errMsg = err instanceof Error ? err.message : String(err);
                  resultStr = JSON.stringify({ error: errMsg });
                }
              }
              toolTimings.push({
                name: t.name,
                durationMs: Date.now() - toolStart,
                error: errMsg,
              });
              send({
                type: "tool_result",
                id: t.id,
                name: t.name,
                result: resultStr,
                error: errMsg,
              });
              const toolMsg: ChatCompletionToolMessageParam = {
                role: "tool",
                tool_call_id: t.id,
                content: resultStr,
              };
              convo.push(toolMsg);
            }),
          );

          // Surface any new sources and pending notes after this tool round.
          for (const src of ctx.citedSources) {
            if (!seenSourceIds.has(src.id)) {
              seenSourceIds.add(src.id);
              send({ type: "source", source: src });
            }
          }
          for (const n of ctx.pendingNotes) {
            send({ type: "pending_note", note: n.note, tags: n.tags });
          }
          ctx.pendingNotes = [];
          for (const d of ctx.pendingEmails) {
            send({
              type: "pending_email",
              draft: {
                subject: d.subject,
                body: d.body,
                tone: d.tone,
                to: d.to,
                cc: d.cc,
              },
            });
          }
          ctx.pendingEmails = [];
        }

        const durationMs = Date.now() - startedAt;
        const costUsd = estimateCost(AGENT_CONFIG.model, totalInputTokens, totalOutputTokens);
        send({
          type: "usage",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          costUsd,
          model: AGENT_CONFIG.model,
          durationMs,
        });
        send({
          type: "error",
          message: `Reached the maximum of ${AGENT_CONFIG.maxToolRounds} tool rounds without a final answer.`,
        });
        controller.close();
        await appendAudit({
          id: crypto.randomUUID(),
          ts: new Date().toISOString(),
          ...tenant,
          clientId: body.client?.id,
          clientName: body.client?.name,
          conversationLength: body.messages?.length ?? 0,
          model: AGENT_CONFIG.model,
          userMessage: lastUser?.content.slice(0, 500) ?? "",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          toolCalls: toolTimings,
          durationMs,
          finishReason: "max_tool_rounds",
          estCostUsd: costUsd,
          error: "Exceeded max tool rounds",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
        controller.close();
        const durationMs = Date.now() - startedAt;
        const costUsd = estimateCost(AGENT_CONFIG.model, totalInputTokens, totalOutputTokens);
        await appendAudit({
          id: crypto.randomUUID(),
          ts: new Date().toISOString(),
          ...tenant,
          clientId: body.client?.id,
          clientName: body.client?.name,
          conversationLength: body.messages?.length ?? 0,
          model: AGENT_CONFIG.model,
          userMessage: lastUser?.content.slice(0, 500) ?? "",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          toolCalls: toolTimings,
          durationMs,
          finishReason: "error",
          estCostUsd: costUsd,
          error: msg,
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};

function streamRefusal(text: string): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (ev: StreamEvent) =>
        controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      send({ type: "start", id: crypto.randomUUID() });
      for (const ch of text) send({ type: "token", text: ch });
      send({ type: "done", finishReason: "stop" });
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
