/**
 * GET /users — returns the team roster from spec §3.2.
 *
 * Hardcoded from the spec — this data never changes during the challenge.
 * Used by the frontend to resolve assignee_id → name, and by chat to look up
 * team members without fabricating answers.
 */

import { Router, Request, Response } from "express";

const router = Router();

// Exact data from CHALLENGE_SPEC.md §3.2
const TEAM = [
  {
    user_id: "u_aarti",
    name: "Aarti Menon",
    department: "Sales — Enterprise",
    scope: "RFPs, RFIs, tenders, and inbound deals above ₹10,00,000",
  },
  {
    user_id: "u_rohit",
    name: "Rohit Sharma",
    department: "Sales — SMB",
    scope: "Product enquiries, demo requests, deals at or below ₹10,00,000",
  },
  {
    user_id: "u_meera",
    name: "Meera Iyer",
    department: "Marketing",
    scope: "Webinars, event and conference sponsorships, content collaborations, PR and media",
  },
  {
    user_id: "u_karan",
    name: "Karan Doshi",
    department: "Alliances",
    scope: "Reseller, channel partner, and technology integration proposals",
  },
  {
    user_id: "u_divya",
    name: "Divya Rao",
    department: "Finance",
    scope: "Invoices, purchase orders, payment reminders, GST and vendor billing",
  },
  {
    user_id: "u_triage",
    name: "Triage Queue",
    department: "Operations",
    scope: "Ambiguous items requiring human review",
  },
];

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ team: TEAM });
});

export default router;
