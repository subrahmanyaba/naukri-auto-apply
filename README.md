# Naukri Auto Apply Userscripts

Three Tampermonkey userscripts for assisted job-application workflows on Naukri.

> Important: this project is experimental browser automation. Naukri can change its UI at any time. Review every application, especially salary, relocation, visa, authorization, legal, and other sensitive questions. Use only with your own account and accurate information. Never automate OTPs, CAPTCHA, or anything that bypasses site security.

## Included scripts

- naukri_home_launcher.user.js — reads job cards from the Recommended Jobs page, queues them, opens job pages in background tabs, enforces a maximum active batch of 100, and closes tabs when the success script signals completion.
- naukri_job_apply.user.js — runs on individual Naukri job pages, presses Apply, handles common text, number, contenteditable, and radio-button questions, and uses configurable answers.
- naukri_success_close.user.js — runs on Naukri result pages, shows a five-second close timer, requests the launcher to close the tab, and records Apply on site jobs.

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

The launcher currently sets the active batch maximum to 100. This is deliberately configurable in the source; smaller batches are safer for testing and easier to monitor.

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

