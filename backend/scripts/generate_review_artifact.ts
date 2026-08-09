import fs from "fs";
import path from "path";

const labelsPath = path.join(__dirname, "../data/eval_labels.json");
const evalLabels = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));

let md = "# Manual Evaluation Labels Review\n\n";
md += "Please review the proposed ground truth for the 50 evaluation emails below. Let me know if any corrections are needed.\n\n";

for (const e of evalLabels) {
  let reason = "";
  if (e.expected_decision === "skip") {
    if (e.expected_skip_reason === "out_of_office") reason = "Contains clear out of office/auto-reply text.";
    else if (e.expected_skip_reason === "spam") reason = "Contains obvious spam keywords (prizes, singles, meds) or unsolicited SEO/vendor outreach.";
    else if (e.expected_skip_reason === "newsletter") reason = "Marketing newsletter with unsubscribe/browser links.";
  } else {
    if (e.expected_category === "enterprise_rfp") reason = "Mention of RFP, RFI, or Tenders, representing large B2B proposals.";
    else if (e.expected_category === "smb_enquiry") reason = "General inbound sales query for small business or trial.";
    else if (e.expected_category === "marketing") {
      if (e.email_id === "email_1073" || e.email_id === "email_1087") reason = "Webinar or marketing event invitation.";
      else if (e.email_id === "email_1100") reason = "Promotional marketing content (e.g. lead-generation whitepaper).";
      else reason = "Sponsorship requests or marketing collaborations routed to u_meera.";
    }
    else if (e.expected_category === "alliances") reason = "Proposals for partnerships, co-marketing, or synergy.";
    else if (e.expected_category === "finance") reason = "Billing, overdue invoices, or tax detail requests.";
    else if (e.expected_category === "triage") reason = "Ambiguous, extremely short, or unclassifiable text.";
  }

  md += `### ${e.email_id}\n`;
  md += `- **Subject**: ${e.subject}\n`;
  md += `- **Body**: ${e.body.replace(/\n/g, " <br> ")}\n`;
  md += `- **Proposed Decision**: \`${e.expected_decision}\`\n`;
  if (e.expected_decision === "classify") {
    md += `- **Proposed Category**: \`${e.expected_category}\`\n`;
  } else {
    md += `- **Proposed Skip Reason**: \`${e.expected_skip_reason}\`\n`;
  }
  md += `- **Reason**: ${reason}\n\n`;
}

// Write to artifact directory
const artifactDir = "C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\04197c8f-6090-4c52-8ee3-e12a403be61c";
const outPath = path.join(artifactDir, "eval_labels_review.md");
fs.writeFileSync(outPath, md);

console.log("Generated review artifact at " + outPath);
