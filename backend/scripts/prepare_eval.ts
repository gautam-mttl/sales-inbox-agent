import fs from "fs";
import path from "path";

const datasetPath = path.join(__dirname, "../data/dataset.json");
const data = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));

// We want ~5 of each of the 8 template types (to ensure variety), plus difficult cases.
const quotas: Record<string, number> = {
  enterprise_rfp: 6,
  smb_enquiry: 6,
  marketing: 6,
  alliances: 6,
  sponsorships: 6,
  finance: 6,
  spam: 6,
  triage: 8
};

const selected = [];
const usedIds = new Set();

// First, pick difficult cases if we can find them
// Modifiers added things like: "Fwd:", "Re:", HTML tags, Hinglish, OOO.
const isDifficult = (e: any) => 
  e.subject.startsWith("Fwd:") || 
  e.subject.startsWith("Re:") || 
  e.body.includes("<div") || 
  e.body.includes("Bhai, deal fix karte hain") || 
  e.subject.includes("Out of Office") ||
  e.body.includes("bhudget");

for (const email of data) {
  if (selected.length >= 50) break;
  const cat = email._expected_category;
  
  if (quotas[cat] > 0) {
    // Prefer difficult cases early on to ensure we get some
    if (isDifficult(email) || Math.random() > 0.5) {
      quotas[cat]--;
      usedIds.add(email.email_id);
      selected.push(email);
    }
  }
}

// Fill remaining quotas if we missed any
for (const email of data) {
  if (selected.length >= 50) break;
  const cat = email._expected_category;
  if (quotas[cat] > 0 && !usedIds.has(email.email_id)) {
    quotas[cat]--;
    usedIds.add(email.email_id);
    selected.push(email);
  }
}

// Create the eval_labels.json
const evalLabels = selected.map(e => ({
  email_id: e.email_id,
  subject: e.subject,
  body: e.body,
  // We will manually label these:
  expected_decision: null,
  expected_category: null,
  expected_skip_reason: null
}));

const outPath = path.join(__dirname, "../data/eval_labels.json");
fs.writeFileSync(outPath, JSON.stringify(evalLabels, null, 2));

console.log(`Prepared ${evalLabels.length} emails in eval_labels.json`);
