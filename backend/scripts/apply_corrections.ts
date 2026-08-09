import fs from "fs";
import path from "path";

const datasetPath = path.join(__dirname, "../data/dataset.json");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));

// Fix dataset defect: No newsletter exists in the 250-email dataset.
// Replace email_1050 (a redundant sponsorship email also in the eval set).
const targetEmail = dataset.find((e: any) => e.email_id === "email_1050");
if (targetEmail) {
  targetEmail.subject = "Weekly Marketing Newsletter: Q3 Trends";
  targetEmail.body = "View in browser\n\nHere are the top marketing trends for Q3. Unsubscribe here.";
  targetEmail._expected_category = "marketing"; // Template origin, but it's a newsletter
}

fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
console.log("Fixed dataset.json defect by adding a newsletter at email_1050");

// Now update eval_labels.json
const labelsPath = path.join(__dirname, "../data/eval_labels.json");
const evalLabels = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));

for (const e of evalLabels) {
  if (e.email_id === "email_1050") {
    // Update its content from the dataset
    e.subject = targetEmail.subject;
    e.body = targetEmail.body;
    e.expected_decision = "skip";
    e.expected_category = null;
    e.expected_skip_reason = "newsletter";
  }

  // User requested explicit correction for 1123 (Boost your SEO)
  if (e.email_id === "email_1123") {
    e.expected_decision = "skip";
    e.expected_category = null;
    e.expected_skip_reason = "spam";
  }
}

fs.writeFileSync(labelsPath, JSON.stringify(evalLabels, null, 2));
console.log("Updated eval_labels.json");
