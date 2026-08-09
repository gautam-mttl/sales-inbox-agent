import fs from "fs";
import path from "path";

// Deterministic random
let seed = 12345;
function random() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}
function sample<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

// 250 total emails
const NUM_EMAILS = 250;
const EMAILS: any[] = [];

// Templates mapping to categories
const TEMPLATES = {
  enterprise_rfp: [
    { subject: "RFP for Enterprise CRM Implementation", body: "Please find attached our RFP for the new CRM rollout across 50 locations. The estimated budget is Rs. 1.2 Crore. Kindly respond by EOD Friday." },
    { subject: "Tender: Cloud Infrastructure Upgrade", body: "We are accepting bids for our cloud migration project. Expected deal value: INR 85,00,000. Forwarding you the details." },
    { subject: "RFI - Data Analytics Platform", body: "Looking for an enterprise-grade analytics solution. We have 10,000+ employees. What is your enterprise pricing model? Budget ~ $150k." }
  ],
  smb_enquiry: [
    { subject: "Need a demo for my small agency", body: "Hi, I run a 5-person marketing agency and we need a tool to manage our clients. Can we get a demo?" },
    { subject: "Pricing inquiry", body: "What's the cost for 10 users? We're a growing startup." },
    { subject: "Product Trial", body: "We want to try your product for our local shop. Budget is tight, around 50k INR annually." }
  ],
  marketing: [
    { subject: "Boost your SEO by 300%", body: "Hi, I noticed your website is not ranking on page 1. We offer guaranteed SEO services." },
    { subject: "Exclusive Lead Gen Strategies", body: "Download our free whitepaper on B2B lead generation!" },
    { subject: "Webinar: Future of AI", body: "Join us this Thursday to learn about AI in sales." }
  ],
  alliances: [
    { subject: "Partnership Opportunity", body: "We have a complementary product and would love to discuss a reseller partnership." },
    { subject: "Let's team up", body: "Our agencies serve the same target market. Interested in a co-marketing campaign?" },
    { subject: "Synergy Call", body: "I think there's strong synergy between our platforms. Let's schedule a call to discuss API integration." }
  ],
  sponsorships: [
    { subject: "Sponsor our annual tech fest", body: "We are hosting an event for 5000 students. Platinum sponsorship is 5 Lakhs INR." },
    { subject: "Donate to our NGO", body: "Please support our cause. We are looking for corporate sponsors." },
    { subject: "Team sponsorship", body: "Would your company be interested in sponsoring our local cricket team?" }
  ],
  finance: [
    { subject: "Overdue Invoice #44921", body: "Your payment of $1,200 is 15 days past due. Please remit immediately." },
    { subject: "Payment confirmation", body: "We have received your payment for the annual subscription." },
    { subject: "Tax details required", body: "Please share your GSTIN for the vendor onboarding process." }
  ],
  spam: [
    { subject: "You won a prize!!!", body: "Click here to claim your $1000 Amazon gift card." },
    { subject: "Buy cheap meds", body: "Discounted pharmacy online. No prescription needed." },
    { subject: "Hot singles in your area", body: "Click the link to chat now." }
  ],
  triage: [
    { subject: "Need help", body: "Can you tell me more about your company?" },
    { subject: "Urgent", body: "Please call me at 9876543210." },
    { subject: "Hello", body: "I am interested." }
  ]
};

// Difficult case modifiers
const MODIFIERS = [
  (e: any) => { e.body = e.body + "\n\nSent from my iPhone"; e.subject = "Fwd: " + e.subject; }, // Forward
  (e: any) => { e.body = "> " + e.body + "\n\nYes, please proceed."; e.subject = "Re: " + e.subject; e.is_reply = true; }, // Quoted reply
  (e: any) => { e.body = `<div style="font-family: Arial;">${e.body}</div>`; }, // HTML
  (e: any) => { e.body = e.body.replace("budget", "bhudget").replace("pricing", "prizeing"); }, // Typos
  (e: any) => { e.body = e.body + " Bhai, deal fix karte hain. Please send details."; }, // Hinglish
  (e: any) => { e.subject = "Automatic reply: Out of Office", e.body = "I am on leave until Monday."; } // OOO
];

function generateDataset() {
  const categories = Object.keys(TEMPLATES);
  
  for (let i = 0; i < NUM_EMAILS; i++) {
    const category = sample(categories);
    const template = sample(TEMPLATES[category as keyof typeof TEMPLATES]);
    
    // Create base email
    const email = {
      _expected_category: category,
      email_id: `email_${1000 + i}`,
      from_name: `Sender ${i}`,
      from_email: `sender${i}@example.com`,
      to_email: "sales@company.com",
      subject: template.subject,
      body: template.body,
      received_at: new Date(Date.now() - random() * 10000000000).toISOString(),
      thread_id: `thread_${500 + Math.floor(i / 3)}`, // Creates multi-message threads automatically
      is_reply: i % 3 !== 0 // 2/3 of emails in a thread are replies
    };

    // Apply difficult case modifier 30% of the time
    if (random() < 0.3) {
      const modifier = sample(MODIFIERS);
      modifier(email);
    }

    // Add misleading cases explicitly
    if (i === 10) {
      email.subject = "Invoice for Marketing Services"; 
      email.body = "Just kidding, we are an agency offering marketing services, do you want to buy?";
    }

    if (i === 20) {
      email.subject = "Out of office: Request for Proposal";
      email.body = "I am out of the office. Please forward the RFP to my colleague.";
    }

    EMAILS.push(email);
  }

  // Ensure output directory exists
  const outDir = path.join(__dirname, "../data");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outDir, "dataset.json"),
    JSON.stringify(EMAILS, null, 2)
  );

  console.log(`Generated ${EMAILS.length} synthetic emails at backend/data/dataset.json`);
}

generateDataset();
