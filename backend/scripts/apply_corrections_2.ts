import fs from "fs";
import path from "path";

const labelsPath = path.join(__dirname, "../data/eval_labels.json");
const evalLabels = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));

for (const e of evalLabels) {
  // Fix sponsorships -> marketing
  if (["email_1029", "email_1039", "email_1041", "email_1070", "email_1075"].includes(e.email_id)) {
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

if (valid) {
  console.log("All validations passed successfully!");
}
