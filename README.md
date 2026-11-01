# Naukri Auto Apply Userscripts

Three Tampermonkey userscripts for assisted job-application workflows on Naukri.

> Important: this project is experimental browser automation. Naukri can change its UI at any time. Review every application, especially salary, relocation, visa, authorization, legal, and other sensitive questions. Use only with your own account and accurate information. Never automate OTPs, CAPTCHA, or anything that bypasses site security.

## Included scripts

- naukri_home_launcher.user.js — reads job cards from the Recommended Jobs page, queues them, and opens **one job at a time**. The next job opens only after the previous tab finishes, followed by a random pause. It also takes longer breaks, enforces a daily limit, and closes tabs when a job is done.
- naukri_job_apply.user.js — runs on individual Naukri job pages, scrolls through the description for a few seconds, presses Apply, types answers character by character with random delays, and handles common text, number, contenteditable, and radio-button questions using configurable answers.
- naukri_success_close.user.js — runs on Naukri result pages, shows a five-second close timer, requests the launcher to close the tab, and records Apply on site jobs.

## The three Naukri application flows

Naukri applications commonly fall into three practical flows. The scripts are designed around these differences:

### 1. Direct apply with no extra questions

The job opens an application flow where the candidate can submit by pressing Apply or completing only the standard profile submission. This is the simplest flow. The job-page script looks for the visible Apply control, submits the application, and waits for a confirmation or result page.

### 2. Direct apply with recruiter questions

The application opens Naukri's question drawer or chat-style form. The recruiter may ask questions such as experience, notice period, yes/no questions, numeric answers, text answers, or radio-button choices. The job-page script identifies the current question, fills recognized answers, and presses Save/Next when enabled. Unknown or sensitive questions pause the flow so the candidate can review or answer manually. Learned answers are stored locally in the browser for later applications.

### 3. Apply on company site

Some jobs do not complete inside Naukri. Instead, Naukri shows an Apply on company site or external application flow. The success handler records the job title, company, job ID, URL, and timestamp in local browser storage, shows a close timer, and asks the launcher to close the tab. At the end of a queue, the launcher can download the recorded jobs as naukri-apply-on-site.txt for separate follow-up.

These flows are different because the page structure, confirmation behavior, and amount of candidate input can vary. The automation can assist with repetitive steps, but it cannot guarantee that every application was accepted or that every changing Naukri layout will be detected correctly. Always review sensitive questions and application confirmations.

## Requirements

- Chrome or Chromium-based browser.
- Tampermonkey extension.
- A signed-in Naukri account.
- Pop-ups/background tabs permitted for naukri.com.

## Installation

1. Install Tampermonkey.
2. Open the Tampermonkey dashboard.
3. Create three separate userscripts.
4. Copy each matching file into its own userscript and save.
5. Keep all three scripts enabled.
6. Open Naukri Recommended Jobs and confirm the launcher panel appears.

The scripts use the same browser localStorage and BroadcastChannel names, so they must run in the same browser profile.

## Configure answers

Edit the CONFIG section near the top of naukri_job_apply.user.js before installing it. The default profile in this example uses:

- Experience: 3.8 years, or 3.8 for numeric-only fields.
- Notice period: Immediate joiner.
- Common yes/no questions: Yes.

Add reusable rules to customAnswers. Questions that are not recognized can be answered through the manual review prompt, then stored in the browser answer store for future matching. Sensitive/review keywords intentionally pause automation.

## Recommended workflow

1. Test with one job first.
2. Check that the Apply button and question drawer are detected.
3. Confirm that the value appears in the field and that Naukri enables Save/Next.
4. Start larger batches only after a successful single-job test.
5. Keep the browser visible enough to notice manual-review notifications.

## Human-like pacing

Naukri rejects applications that arrive in parallel, so the launcher never runs two jobs at once. Edit the `PACING` block at the top of naukri_home_launcher.user.js to change these defaults:

| Setting | Default | Meaning |
| --- | --- | --- |
| gapBetweenJobsMs | 25–60 s | Random pause after one job finishes, before the next opens |
| breakEveryJobs / breakLengthMs | every 8–12 jobs, 3–7 min | Longer break now and then |
| dailyLimit | 50 | Queue stops after this many jobs per day (0 = no limit) |
| jobTimeoutMs | 6 min | A tab that never reports back is closed and retried |
| manualTimeoutMs | 30 min | How long the queue waits when a job needs you |
| openInForeground | true | Job tab opens in front, like a person clicking it |

The job-page script has matching `[min,max]` ranges in its CONFIG (readJobMs, thinkBeforeAnswerMs, typeCharMs, afterTypeMs, beforeClickMs).

When a job needs you (an unknown question prompt, you clicked or typed in the page, or you pressed "Keep open"), the launcher shows WAITING FOR YOU and holds the queue. Close that tab when you're done and the queue continues.

## Apply on site list

Apply on site results are stored under the browser localStorage key codexNaukriOnSiteJobs. When the launcher queue is fully finished, it downloads naukri-apply-on-site.txt from the Recommended Jobs tab. Browser download settings may ask for permission or block repeated downloads.

## Troubleshooting

- No launcher panel: confirm the Recommended Jobs URL matches Naukri's mnjuser/recommendedjobs page and the userscript is enabled.
- Tabs do not open: allow pop-ups/background tabs and confirm Tampermonkey has access to naukri.com.
- A question is not filled: inspect the live Naukri DOM; site classes and question markup may have changed. Add a custom rule or answer manually.
- Save/Next stays disabled: click into the field and re-enter the answer manually. React-controlled inputs may reject synthetic changes.
- A tab will not close: browser security may prevent scripts from closing tabs they did not open. The launcher also receives a close request through its tab handle; close manually if the browser keeps it open.

## Privacy

The scripts do not send resume data to a third-party server. Learned answers are stored in the browser through Tampermonkey storage/localStorage. Treat the browser profile as personal data and clear the stored answer rules before sharing the profile.

## License

Add the license you prefer before publishing. If you want a permissive default, MIT is a common choice.
