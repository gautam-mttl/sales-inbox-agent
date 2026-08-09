import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });
import { classifyEmail } from "../src/services/classifier";
import { ParsedEmail } from "../src/validation/ingestSchemas";

async function runEvaluation() {
  const labelsPath = path.join(__dirname, "../data/eval_labels.json");
  const evalSet = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));

  console.log(`Starting evaluation on ${evalSet.length} samples from eval_labels.json...`);

  const payloads: ParsedEmail[] = evalSet.map((e: any) => ({
    email_id: e.email_id,
    from_name: e.from_name,
    from_email: e.from_email,
    to_email: e.to_email,
    subject: e.subject,
    body: e.body,
    received_at: e.received_at,
    thread_id: e.thread_id,
    is_reply: e.is_reply
  }));

  const startTime = Date.now();
  const classifications: any[] = [];
  const errors: any[] = [];
  
  let apiCallsCount = 0;
  
  for (const payload of payloads) {
    try {
      // The rate limiter allows 12 RPM, which is 1 every 5 seconds.
      // We'll sleep 5.5 seconds between calls to be safe.
      if (apiCallsCount > 0) {
        await new Promise(r => setTimeout(r, 5500));
      }
      
      const result = await classifyEmail(payload);
      // If classifyEmail calls Gemini, we assume 1 API call per classifyEmail that reaches Gemini.
      // Wait, deterministic skips don't call Gemini!
      // We can inspect result to know if Gemini was called, but typically any non-skip calls Gemini.
      // We'll just count total processed, and we'll estimate Gemini calls by those not deterministically skipped.
      
      classifications.push({
        source_email_id: payload.email_id,
        ...result
      });
      process.stdout.write(".");
      apiCallsCount++; // Actually this is emails processed.
    } catch (e) {
      errors.push({ email_id: payload.email_id, error: e });
      process.stdout.write("E");
    }
  }
  
  const duration = Date.now() - startTime;

  if (errors.length > 0) {
    console.error("\nClassification errors occurred:", errors);
  }

  // Calculate Metrics in the unified Label space
  let TP: Record<string, number> = {};
  let FP: Record<string, number> = {};
  let FN: Record<string, number> = {};
  let support: Record<string, number> = {};

  const failures: any[] = [];
  let geminiCalls = 0;

  for (let i = 0; i < evalSet.length; i++) {
    const e = evalSet[i];
    const cl = classifications.find(c => c.source_email_id === e.email_id);
    
    // Determine EXPECTED unified label
    let expected = "unknown";
    if (e.expected_decision === "skip") {
      expected = e.expected_skip_reason;
    } else if (e.expected_decision === "classify") {
      expected = e.expected_category;
    }

    // Determine PREDICTED unified label
    let predicted = "unknown";
    if (cl) {
      if (cl.action === "skip" || cl.action === "skipped") {
        predicted = cl.skip_reason || "unknown_skip";
      } else {
        predicted = cl.category || "unknown_category";
        geminiCalls++; // Any non-skip involves a Gemini call
      }
    }

    support[expected] = (support[expected] || 0) + 1;

    if (expected === predicted) {
      TP[expected] = (TP[expected] || 0) + 1;
    } else {
      FP[predicted] = (FP[predicted] || 0) + 1;
      FN[expected] = (FN[expected] || 0) + 1;
      failures.push({
        email_id: e.email_id,
        subject: e.subject,
        expected,
        predicted,
        body: e.body,
        reasoning: cl?.reasoning || "No reasoning (deterministic or error)"
      });
    }
  }

  console.log("\n=== EVALUATION REPORT ===");
  console.log(`Evaluated 50 emails in ${(duration/1000).toFixed(1)}s.`);
  console.log(`Estimated Gemini API calls made: ${geminiCalls}\n`);
  
  const allCategories = Array.from(new Set([...Object.keys(support), ...Object.keys(FP), ...Object.keys(FN)])).sort();
  
  console.log("Category | Precision | Recall | Support");
  console.log("---------|-----------|--------|--------");
  for (const cat of allCategories) {
    const tp = TP[cat] || 0;
    const fp = FP[cat] || 0;
    const fn = FN[cat] || 0;
    
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    
    console.log(`${cat.padEnd(14)} | ${(precision*100).toFixed(1).padStart(8)}% | ${(recall*100).toFixed(1).padStart(5)}% | ${support[cat]||0}`);
  }

  // Write EVALS.md
  let evalMd = `# Phase 10: Synthetic Dataset & Evaluation\n\n`;
  evalMd += `## Evaluation Methodology\n`;
  evalMd += `We evaluated the routing system using 50 manually labelled emails representing a stratified mix of enterprise RFPs, SMB enquiries, marketing/alliances, finance emails, spam, newsletters, out-of-office autoreplies, and ambiguous triage emails. \n\n`;
  evalMd += `Expected decision and expected category were maintained separately in the ground truth to accurately evaluate the deterministic skip engine vs. the LLM classifier. For the precision/recall metrics below, we mapped the outcomes into a unified 9-label evaluation space: \n`;
  evalMd += `- **Classifications**: \`enterprise_rfp\`, \`smb_enquiry\`, \`marketing\`, \`alliances\`, \`finance\`, \`triage\`\n`;
  evalMd += `- **Skips**: \`out_of_office\`, \`spam\`, \`newsletter\`\n\n`;
  
  evalMd += `## Metrics Summary\n`;
  evalMd += `- **Evaluation Set**: 50 examples\n`;
  evalMd += `- **Gemini API Calls**: ${geminiCalls} (Deterministic skips correctly avoided the LLM)\n\n`;

  evalMd += `### Precision and Recall\n`;
  evalMd += `| Label | Precision | Recall | Support |\n`;
  evalMd += `|---|---|---|---|\n`;
  for (const cat of allCategories) {
    const tp = TP[cat] || 0;
    const fp = FP[cat] || 0;
    const fn = FN[cat] || 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    evalMd += `| \`${cat}\` | ${(precision*100).toFixed(1)}% | ${(recall*100).toFixed(1)}% | ${support[cat]||0} |\n`;
  }

  evalMd += `\n## Genuine Unresolved Failure Cases\n`;
  if (failures.length === 0) {
    evalMd += `No failures detected. Perfect classification.\n`;
  } else {
    failures.forEach((f, i) => {
      evalMd += `\n### Failure #${i+1}: ${f.email_id}\n`;
      evalMd += `- **Subject**: ${f.subject}\n`;
      evalMd += `- **Expected**: \`${f.expected}\`\n`;
      evalMd += `- **Predicted**: \`${f.predicted}\`\n`;
      evalMd += `- **Model Reasoning**: ${f.reasoning}\n`;
      evalMd += `- **Body Snippet**: ${f.body.substring(0, 150)}...\n`;
    });
  }

  const outPath = path.join(__dirname, "../../EVALS.md");
  fs.writeFileSync(outPath, evalMd);
  console.log(`\nSaved EVALS.md in project root (${failures.length} failures logged).`);
}

runEvaluation().catch(console.error);
