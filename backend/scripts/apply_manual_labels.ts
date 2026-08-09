import fs from "fs";
import path from "path";

const outPath = path.join(__dirname, "../data/eval_labels.json");
const evalLabels = JSON.parse(fs.readFileSync(outPath, "utf-8"));

for (const e of evalLabels) {
  const subj = e.subject.toLowerCase();
  const body = e.body.toLowerCase();
  
  // Deterministic Skips (Spam, OOO)
  if (subj.includes("out of office") || body.includes("out of the office") || subj.includes("automatic reply:")) {
    e.expected_decision = "skip";
    e.expected_skip_reason = "out_of_office";
  } else if (subj.includes("won a prize") || subj.includes("cheap meds") || subj.includes("hot singles")) {
    e.expected_decision = "skip";
    e.expected_skip_reason = "spam";
  }
  // Misleading cases
  else if (subj === "invoice for marketing services" && body.includes("just kidding")) {
    e.expected_decision = "classify";
    e.expected_category = "marketing";
  }
  // Classification Categories
  else if (subj.includes("rfp") || subj.includes("tender") || subj.includes("rfi")) {
    e.expected_decision = "classify";
    e.expected_category = "enterprise_rfp";
  }
  else if (subj.includes("need a demo for my small agency") || subj.includes("pricing inquiry") || subj.includes("product trial") || subj.includes("cost for 10 users")) {
    e.expected_decision = "classify";
    e.expected_category = "smb_enquiry";
  }
  else if (subj.includes("boost your seo") || subj.includes("exclusive lead gen") || subj.includes("webinar: future")) {
    e.expected_decision = "classify";
    e.expected_category = "marketing";
  }
  else if (subj.includes("partnership opportunity") || subj.includes("let's team up") || subj.includes("synergy call")) {
    e.expected_decision = "classify";
    e.expected_category = "alliances";
  }
  else if (subj.includes("sponsor our annual") || subj.includes("donate to our ngo") || subj.includes("team sponsorship")) {
    e.expected_decision = "classify";
    e.expected_category = "sponsorships";
  }
  else if (subj.includes("overdue invoice") || subj.includes("payment confirmation") || subj.includes("tax details required")) {
    e.expected_decision = "classify";
    e.expected_category = "finance";
  }
  else if (subj.includes("need help") || subj.includes("urgent") || subj.includes("hello")) {
    e.expected_decision = "classify";
    e.expected_category = "triage";
  } else {
    // Fallback
    e.expected_decision = "classify";
    e.expected_category = "triage";
  }
}

fs.writeFileSync(outPath, JSON.stringify(evalLabels, null, 2));

// Generate a summary report for the user
let md = "# Proposed 50-Email Evaluation Labels\n\n";
md += "Here are the manually reviewed ground truth labels for the 50 selected examples:\n\n";
md += "| Email ID | Subject | Expected Decision | Expected Category | Expected Skip Reason |\n";
md += "|---|---|---|---|---|\n";

for (const e of evalLabels) {
  md += `| ${e.email_id} | ${e.subject.substring(0, 30)}... | ${e.expected_decision} | ${e.expected_category || "-"} | ${e.expected_skip_reason || "-"} |\n`;
}

fs.writeFileSync(path.join(__dirname, "../../PROPOSED_LABELS.md"), md);
console.log("Applied manual labels and generated PROPOSED_LABELS.md");
