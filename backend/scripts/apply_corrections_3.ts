import fs from "fs";
import path from "path";

const labelsPath = path.join(__dirname, "../data/eval_labels.json");
const evalLabels = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));

for (const e of evalLabels) {
  if (e.email_id === "email_1001" || e.email_id === "email_1008") {
    e.expected_category = "marketing";
  }
}

fs.writeFileSync(labelsPath, JSON.stringify(evalLabels, null, 2));

// Run Validation
let valid = true;
const validCategories = ["enterprise_rfp", "smb_enquiry", "marketing", "alliances", "finance", "triage"];
const validSkipReasons = ["out_of_office", "newsletter", "spam"];

if (evalLabels.length !== 50) {
  console.error(`Validation Failed: Expected 50 examples, got ${evalLabels.length}`);
  valid = false;
}

for (const e of evalLabels) {
  if (e.expected_decision === "classify") {
    if (!validCategories.includes(e.expected_category)) {
      console.error(`Validation Failed: Invalid category '${e.expected_category}' for ${e.email_id}`);
      valid = false;
    }
    if (e.expected_skip_reason !== null) {
      console.error(`Validation Failed: classify decision with skip_reason !== null for ${e.email_id}`);
      valid = false;
    }
  } else if (e.expected_decision === "skip") {
    if (!validSkipReasons.includes(e.expected_skip_reason)) {
      console.error(`Validation Failed: Invalid skip reason '${e.expected_skip_reason}' for ${e.email_id}`);
      valid = false;
    }
    if (e.expected_category !== null) {
      console.error(`Validation Failed: skip decision with category !== null for ${e.email_id}`);
      valid = false;
    }
  } else {
    console.error(`Validation Failed: Invalid decision '${e.expected_decision}' for ${e.email_id}`);
    valid = false;
  }
}

// Check dataset.json length
const datasetPath = path.join(__dirname, "../data/dataset.json");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
if (dataset.length !== 250) {
  console.error(`Validation Failed: dataset.json expected length 250, got ${dataset.length}`);
  valid = false;
}

if (valid) {
  console.log("All validations passed successfully! Dataset remains at 250 emails.");
}
