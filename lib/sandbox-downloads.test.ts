import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  ADP_EXPORT_DIR,
  DOWNLOAD_EXPORT_PATH,
  buildPaychexToAdpConverterScript,
  buildSandboxDownloadsArchiveCommand,
} from "./sandbox-downloads";

test("downloads archive command collects supported Paychex export files", () => {
  const command = buildSandboxDownloadsArchiveCommand();

  assert.match(command, /Downloads/);
  assert.match(command, /\.csv/);
  assert.match(command, /\.xlsx/);
  assert.match(command, /\.pdf/);
  assert.match(command, /\.zip/);
  assert.match(command, /crdownload/);
  assert.match(command, /paychex_to_adp.py/);
  assert.match(command, /PAYCHEX_ADP_EXPORT_DIR=/);
  assert.match(command, /PAYCHEX_EXPORT_ARCHIVE=/);
  assert.equal(DOWNLOAD_EXPORT_PATH, "/tmp/paychex-downloads.zip");
  assert.equal(ADP_EXPORT_DIR, "/tmp/paychex-adp-export");
});

test("Paychex to ADP converter creates a Workforce Now paydata CSV", async () => {
  const root = await mkdtemp(join(tmpdir(), "paychex-adp-"));
  const downloads = join(root, "downloads");
  const output = join(root, "adp");
  const scriptPath = join(root, "paychex_to_adp.py");

  await writeFile(scriptPath, buildPaychexToAdpConverterScript());
  await writeFile(
    join(root, "source.csv"),
    [
      "Employee ID,Employee Name,Regular Hours,Overtime Hours,Hourly Rate,Department",
      "0042,Jane Doe,37.5,2.25,18.75,200",
    ].join("\n")
  );

  await mkdir(downloads);
  await rename(join(root, "source.csv"), join(downloads, "source.csv"));

  const result = spawnSync(
    "python3",
    [scriptPath, downloads, output],
    {
      env: {
        ...process.env,
        PAYCHEX_ADP_COMPANY_CODE: "ab",
        PAYCHEX_ADP_BATCH_ID: "PXADP",
      },
      encoding: "utf8",
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const csv = await readFile(join(output, "PRab_EPI.csv"), "utf8");

  assert.equal(
    csv.trim(),
    [
      "Co Code,Batch ID,File #,Employee Name,Temp Dept,Temp Rate,Reg Hours,O/T Hours",
      "ab_,PXADP,0042,Jane Doe,200,18.75,37.50,2.25",
    ].join("\n")
  );

  const manifest = await readFile(join(output, "conversion_manifest.json"), "utf8");
  assert.match(manifest, /"source.csv"/);
  assert.match(manifest, /"PRab_EPI.csv"/);
});
