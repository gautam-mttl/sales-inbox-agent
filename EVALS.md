# Phase 10: Synthetic Dataset & Evaluation

## Evaluation Methodology
We evaluated the routing system using 50 manually labelled emails representing a stratified mix of enterprise RFPs, SMB enquiries, marketing/alliances, finance emails, spam, newsletters, out-of-office autoreplies, and ambiguous triage emails. 

Expected decision and expected category were maintained separately in the ground truth to accurately evaluate the deterministic skip engine vs. the LLM classifier. For the precision/recall metrics below, we mapped the outcomes into a unified 9-label evaluation space: 
- **Classifications**: `enterprise_rfp`, `smb_enquiry`, `marketing`, `alliances`, `finance`, `triage`
- **Skips**: `out_of_office`, `spam`, `newsletter`

## Metrics Summary
- **Evaluation Set**: 50 examples
- **Gemini API Calls**: 28 (Deterministic skips correctly avoided the LLM)

### Precision and Recall
| Label | Precision | Recall | Support |
|---|---|---|---|
| `alliances` | 100.0% | 100.0% | 4 |
| `enterprise_rfp` | 100.0% | 100.0% | 6 |
| `finance` | 100.0% | 66.7% | 6 |
| `marketing` | 100.0% | 40.0% | 10 |
| `newsletter` | 20.0% | 100.0% | 1 |
| `out_of_office` | 100.0% | 100.0% | 5 |
| `smb_enquiry` | 100.0% | 100.0% | 5 |
| `spam` | 58.3% | 100.0% | 7 |
| `triage` | 100.0% | 83.3% | 6 |

## Failure Cases I Did Not Fix

### Failure #1: email_1006
- **Subject**: Re: Hello
- **Expected**: `triage`
- **Predicted**: `spam`
- **Model Reasoning**: The email body 'Yes, please proceed.' is lacking context, appears to be an automated or irrelevant response, and does not contain any business inquiry or clear intent.
- **Body Snippet**: > I am interested.

Yes, please proceed....

### Failure #2: email_1029
- **Subject**: Team sponsorship
- **Expected**: `marketing`
- **Predicted**: `spam`
- **Model Reasoning**: The email is an unsolicited vendor/sponsorship request asking us to pay for sponsoring their cricket team, which falls under unsolicited sales/spam TO us rather than a customer inbound deal.
- **Body Snippet**: Would your company be interested in sponsoring our local cricket team?...

### Failure #3: email_1041
- **Subject**: Donate to our NGO
- **Expected**: `marketing`
- **Predicted**: `spam`
- **Model Reasoning**: The email is an unsolicited solicitation for donations to an NGO, which falls under vendor/external spam rather than a business lead or relevant corporate communication.
- **Body Snippet**: Please support our cause. We are looking for corporate sponsors....

### Failure #4: email_1073
- **Subject**: Webinar: Future of AI
- **Expected**: `marketing`
- **Predicted**: `newsletter`
- **Model Reasoning**: The email is a promotional invitation for a webinar about the Future of AI and does not represent a commercial inbound deal, RFP, or vendor query requiring sales routing.
- **Body Snippet**: Join us this Thursday to learn about AI in sales....

### Failure #5: email_1075
- **Subject**: Team sponsorship
- **Expected**: `marketing`
- **Predicted**: `spam`
- **Model Reasoning**: The email is an unsolicited vendor/sponsorship request asking us to pay for sponsoring a local cricket team, which falls under unsolicited sales/spam directed at us.
- **Body Snippet**: Would your company be interested in sponsoring our local cricket team?...

### Failure #6: email_1077
- **Subject**: Tax details required
- **Expected**: `finance`
- **Predicted**: `spam`
- **Model Reasoning**: The email is an unsolicited vendor onboarding request asking for our GSTIN, indicating a third-party vendor trying to engage with us rather than an inbound sales lead or partner proposal.
- **Body Snippet**: Please share your GSTIN for the vendor onboarding process....

### Failure #7: email_1086
- **Subject**: Fwd: Payment confirmation
- **Expected**: `finance`
- **Predicted**: `newsletter`
- **Model Reasoning**: This is an automated payment confirmation notification for a subscription we likely paid for, rather than an inbound sales or support inquiry.
- **Body Snippet**: We have received your payment for the annual subscription.

Sent from my iPhone...

### Failure #8: email_1087
- **Subject**: Webinar: Future of AI
- **Expected**: `marketing`
- **Predicted**: `newsletter`
- **Model Reasoning**: The email is a promotional invitation for a webinar about the Future of AI and does not require sales routing.
- **Body Snippet**: Join us this Thursday to learn about AI in sales....

### Failure #9: email_1100
- **Subject**: Exclusive Lead Gen Strategies
- **Expected**: `marketing`
- **Predicted**: `newsletter`
- **Model Reasoning**: The email is an automated promotional message offering a free whitepaper on B2B lead generation with no inbound business intent or inquiry.
- **Body Snippet**: Download our free whitepaper on B2B lead generation!...
