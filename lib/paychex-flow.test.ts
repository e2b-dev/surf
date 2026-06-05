import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAYCHEX_ADP_FLOW_PROMPT,
  PAYCHEX_FLOW_TITLE,
  PAYCHEX_LOGIN_URL,
} from "./paychex-flow";

test("Paychex flow points to the migration repo login URL", () => {
  assert.equal(PAYCHEX_LOGIN_URL, "https://partners.paychex.com/companies");
});

test("Paychex flow prompt is limited to reports access discovery", () => {
  assert.equal(PAYCHEX_FLOW_TITLE, "Paychex Flex to ADP migration");
  assert.match(PAYCHEX_ADP_FLOW_PROMPT, /Paychex Flex/i);
  assert.match(PAYCHEX_ADP_FLOW_PROMPT, /Analytics and Reports/i);
  assert.match(PAYCHEX_ADP_FLOW_PROMPT, /All Reports/i);
  assert.match(PAYCHEX_ADP_FLOW_PROMPT, /company.*top right/i);
  assert.match(PAYCHEX_ADP_FLOW_PROMPT, /missing.*reports access/i);
  assert.match(
    PAYCHEX_ADP_FLOW_PROMPT,
    /We are missing permisions for this client, they need to enable the reports and analytics section/,
  );
  assert.doesNotMatch(PAYCHEX_ADP_FLOW_PROMPT, /LibreOffice|Fibonacci|GitHub/i);
});
