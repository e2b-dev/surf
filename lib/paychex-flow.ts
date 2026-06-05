export const PAYCHEX_LOGIN_URL = "https://partners.paychex.com/companies";

export const PAYCHEX_FLOW_TITLE = "Paychex Flex to ADP migration";

export const PAYCHEX_ADP_FLOW_PROMPT = `
Start the Paychex Flex to ADP migration discovery flow.

Use Chrome in the Linux desktop. If Chrome is already open on the Paychex portal, continue from there. The Paychex Flex login URL is ${PAYCHEX_LOGIN_URL}.

After the user finishes any required login or MFA steps, make sure the intended company is selected in the top right company selector before checking reports. If the visible company does not look selected or the selector shows multiple companies, pause and ask the user which company to use.

Navigate Paychex Flex using this path:
1. Open the menu on the left hand side.
2. Choose Analytics and Reports.
3. Open All Reports.

If there is no reports section in the dropdown, reply exactly: "We are missing permisions for this client, they need to enable the reports and analytics section".

Determine whether this company has access to reports. Some companies did not grant access to reports. If reports access is missing, blocked, unavailable, or permission denied, stop the flow and clearly report that the selected company is missing reports access. If All Reports is available, report that Paychex reports access is available and wait for the next migration instruction.
`.trim();
