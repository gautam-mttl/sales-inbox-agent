import { getGenAI } from "../lib/gemini";
import { env } from "../config/env";
import { ChatRequest, ChatResponse, Intent, IntentSchema } from "../validation/chatSchemas";
import { executeChatQuery } from "../db/chatQueries";
import { SchemaType } from "@google/generative-ai";

/**
 * Handle a chat request via the two-pass intent architecture.
 */
export async function processChat(req: ChatRequest): Promise<ChatResponse> {
  const model = getGenAI().getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: {
      temperature: 0.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            description: "The type of query intent. Must be one of: CATEGORY_COUNTS, TRIAGE_LIST, SPURIOUS_RATE, FILTER_TASKS, RFP_DEAL_VALUES, THREAD_UPDATES, UNANSWERABLE",
          },
          unanswerable_reason: {
            type: SchemaType.STRING,
            description: "If UNANSWERABLE, why it cannot be answered.",
          },
          filter_priority: {
            type: SchemaType.STRING,
            description: "Priority filter: low, medium, or high",
          },
          filter_max_confidence: {
            type: SchemaType.NUMBER,
          },
        },
        required: ["type"],
      },
    },
  });

  const intentPrompt = `
You are an intent classifier for a Sales Inbox routing system.
Map the user's query to exactly ONE of the following intents:

- CATEGORY_COUNTS: User asks about counts of emails by category, marketing, spam, etc.
- TRIAGE_LIST: User asks about tasks sitting in triage.
- SPURIOUS_RATE: User asks about the spurious rate or false positive tasks.
- FILTER_TASKS: User asks to filter tasks by priority or confidence (e.g. "high priority but low confidence"). Extract filter_priority and filter_max_confidence (as a decimal, e.g. 0.5).
- RFP_DEAL_VALUES: User asks for total deal value of open RFPs.
- THREAD_UPDATES: User asks about threads updated more than once.
- UNANSWERABLE: User asks something you cannot do (e.g., take actions like "Send Aarti an email"), asks about data we do not store (e.g., "resellers vs tech partners" breakdown when we only have "alliances"), or asks a completely unrelated question. Provide 'unanswerable_reason'.

User Query: "${req.query}"
`;

  let intent: Intent;
  let jsonStr: string | undefined;
  try {
    const intentRes = await model.generateContent(intentPrompt);
    jsonStr = intentRes.response.text().replace(/^```json\n?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    intent = IntentSchema.parse(parsed);
  } catch (err) {
    console.error("Intent parsing failed:", err, "JSON:", jsonStr || 'N/A');
    // If classification fails, default to unanswerable
    intent = { type: "UNANSWERABLE", unanswerable_reason: "Failed to understand query intent." };
  }

  const supportingData = await executeChatQuery(req.candidate_id, intent);

  // If intent was UNANSWERABLE, we ensure the data is empty and let the generator explain.
  const generatorModel = getGenAI().getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1,
    },
  });

  const generatePrompt = `
You are a helpful assistant for a Sales Inbox routing system.
You MUST answer the user's question using ONLY the provided supporting data JSON.
DO NOT invent facts, numbers, or names.
If the supporting data says zero, say zero plainly.
If the intent was UNANSWERABLE, polite decline based on the unanswerable_reason, and DO NOT pretend to take actions.

User Question: "${req.query}"
Intent: ${intent.type}
Unanswerable Reason: ${intent.unanswerable_reason || "N/A"}
Supporting Data JSON:
${JSON.stringify(supportingData, null, 2)}

Provide a concise, direct, natural language answer.
`;

  try {
    const answerRes = await generatorModel.generateContent(generatePrompt);
    const answer = answerRes.response.text().trim();
    return {
      answer,
      supporting_data: supportingData,
    };
  } catch (err) {
    return {
      answer: "I encountered an error generating the response.",
      supporting_data: supportingData,
    };
  }
}
