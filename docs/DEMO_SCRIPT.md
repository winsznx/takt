# Demo script (target 2:45, hard limit 3:00)

Live site: https://takt-beige.vercel.app. Synthetic case: TAKT-DEMO-001.
Browser window 1440×900, zoom 100%, fresh profile or cleared site data.

| Time | Screen and action | Say |
|---|---|---|
| 0:00–0:15 | Homepage, hero visible | "A worker's schedule, clock record, pay stub, and manager messages can all describe the same shift differently. Takt reconstructs what those records actually support." |
| 0:15–0:40 | Click **Try a sample** → **Open this sample** on TAKT-DEMO-001. Records page loads four files. | "Four records: a schedule screenshot, the employer's timecard, a pay stub, and a text from the manager. Each file is fingerprinted before anything reads it and stays in this browser. The PDFs are read right here from their own text." |
| 0:40–1:10 | **Review what Takt read** → **Time record / timecard** tab. Hover the Sep 1 clock-in fact so its box lights up on the document. Click **Confirm the clear ones**. Repeat on **Pay stub**. On the two image tabs click **Enter what this sample image shows** (or **Read this sample with AI**, see note). | "Every value is outlined where it appears in the original. Nothing counts until I confirm it. Takt proposes; the worker decides." |
| 1:10–1:50 | **Compare my records** → **Use the sample worker's answers**. Stop on the Takt Diff card. Point at 7:40 AM vs 8:00 AM, then the source chips, then open **How this was calculated**. | "Here's the core of it. The schedule and the manager's text say 7:40. The worker confirmed 7:40. The employer's clock says 8:00. That's 20 minutes the employer record doesn't show, and every source is linked. AI only proposed facts. The worker confirmed the interval, and plain code reconciled the records and did the math under California's overtime rules." |
| 1:50–2:00 | Scroll the Takt Line to **Thu, Sep 10**. | "On the 10th the schedule also says 7:40, but the worker says they started at 8. A schedule isn't work, so there's no finding." |
| 2:00–2:20 | **Build my packet** → **Build and verify packet**. Show the file list and the green receipt. | "Takt fills the official California Form 1 and Form 55 and adds an evidence index, the calculation, and a fingerprinted manifest. Then it verifies the packet from its bytes." |
| 2:20–2:35 | Open **/verify** in the same tab. Drop the TAKT-TAMPER-001 zip (downloaded from /proof beforehand). Red result. | "Change one number, here Form 1's total, and verification fails." |
| 2:35–2:48 | Open **My cases** and point at TAKT-CONTROL-001 and TAKT-AMBIG-001 in the list (or show /proof's "What can go wrong" table). | "Matching records produce no claim. Missing or conflicting evidence makes Takt stop rather than invent one. Takt: records you can inspect, correct, and prove." |

## Note on the live AI read

"Read this sample with AI" sends the synthetic image to Gemini's free tier. It
can take up to a minute, and it fails when the provider is busy or the daily
quota is used. Only use it if a test click just before recording worked;
otherwise use **Enter what this sample image shows**. Don't show the API on
camera.
