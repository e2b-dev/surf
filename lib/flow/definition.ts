/**
 * Flow definition system - FlowBuilder and pre-defined flows
 */
import { FlowDefinition, FlowStep, ExpectedState } from "@/types/flow";
import { v4 as uuidv4 } from "uuid";

/**
 * Builder class for creating flow definitions
 */
export class FlowBuilder {
  private id: string;
  private name: string = "";
  private description: string = "";
  private steps: FlowStep[] = [];

  constructor(name?: string) {
    this.id = uuidv4();
    if (name) {
      this.name = name;
    }
  }

  /**
   * Set the flow name
   */
  setName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Set the flow description
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Add a step to the flow
   */
  addStep(step: Omit<FlowStep, "id">): this {
    this.steps.push({
      ...step,
      id: uuidv4(),
    });
    return this;
  }

  /**
   * Remove a step by ID
   */
  removeStep(stepId: string): this {
    this.steps = this.steps.filter((s) => s.id !== stepId);
    return this;
  }

  /**
   * Reorder steps by providing new order of IDs
   */
  reorderSteps(stepIds: string[]): this {
    const stepMap = new Map(this.steps.map((s) => [s.id, s]));
    this.steps = stepIds
      .map((id) => stepMap.get(id))
      .filter((s): s is FlowStep => s !== undefined);
    return this;
  }

  /**
   * Build the flow definition
   */
  build(): FlowDefinition {
    if (!this.name) {
      throw new Error("Flow name is required");
    }
    if (this.steps.length === 0) {
      throw new Error("Flow must have at least one step");
    }

    const now = new Date();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      steps: this.steps,
      createdAt: now,
      updatedAt: now,
    };
  }
}

/**
 * Pre-defined step: Download .deb packages via Chrome
 */
export const DOWNLOAD_STEP: Omit<FlowStep, "id"> = {
  name: "Download",
  description: "Download .deb packages for applications via Chrome browser",
  prompt: `Open Firefox browser and download the following .deb packages:
1. Go to https://code.visualstudio.com/download and download the .deb file for Ubuntu/Debian
2. Save it to the Downloads folder

Important:
- Wait for each download to complete before proceeding
- If a download dialog appears, click "Save" or "OK"
- After downloading, verify the file exists in ~/Downloads`,
  expectedState: {
    type: "file",
    filePath: "/home/user/Downloads",
    fileContains: ".deb",
  } as ExpectedState,
  timeout: 120000, // 2 minutes
};

/**
 * Pre-defined step: JIRA login and issue creation
 */
export const JIRA_STEP: Omit<FlowStep, "id"> = {
  name: "JIRA",
  description: "Log into JIRA, create an issue, and link it to code",
  prompt: `Interact with JIRA to create a new issue:
1. Open Firefox and navigate to the JIRA instance (if not already open, go to https://jira.atlassian.com or the configured JIRA URL)
2. If prompted, log in with the provided credentials
3. Click "Create" to create a new issue
4. Fill in the following:
   - Project: Select the first available project
   - Issue Type: Task
   - Summary: "Automated test issue - [timestamp]"
   - Description: "This issue was created by the automated flow simulation"
5. Click "Create" to submit the issue
6. Verify the issue was created by checking the confirmation message or issue key

Important:
- Take your time with each step
- If login is required, use test credentials
- Note the issue key (e.g., PROJ-123) for verification`,
  expectedState: {
    type: "screenshot",
    screenshotPrompt:
      "Does this screenshot show a JIRA issue that was successfully created? Look for an issue key (like PROJ-123), a success message, or the issue detail page.",
  } as ExpectedState,
  timeout: 180000, // 3 minutes
};

/**
 * Pre-defined step: VSCode file creation
 */
export const VSCODE_STEP: Omit<FlowStep, "id"> = {
  name: "VSCode",
  description: "Open VSCode, create a new file, and save it",
  prompt: `Work with Visual Studio Code to create and save a file:
1. Open Visual Studio Code (click on the VSCode icon in the dock/menu or run "code" in terminal)
2. Wait for VSCode to fully load
3. Create a new file: File -> New File (or press Ctrl+N)
4. Type the following content:
   // Automated test file
   // Created by flow simulation
   console.log("Hello from automated test!");
5. Save the file: File -> Save (or press Ctrl+S)
6. When prompted for filename, save as "automated-test.js" in the home directory or Documents folder
7. Verify the file was saved by checking the tab title (should show the filename without "Untitled")

Important:
- Make sure VSCode is fully loaded before interacting
- Use keyboard shortcuts if clicking doesn't work
- Confirm the save operation completed`,
  expectedState: {
    type: "file",
    filePath: "/home/user/automated-test.js",
    fileContains: "Hello from automated test",
  } as ExpectedState,
  timeout: 120000, // 2 minutes
};

/**
 * Create the default flow with Download, JIRA, and VSCode steps
 */
export function createDefaultFlow(): FlowDefinition {
  return new FlowBuilder("JIRA + Download + VSCode")
    .setDescription(
      "Test flow that downloads packages, creates a JIRA issue, and creates a file in VSCode"
    )
    .addStep(DOWNLOAD_STEP)
    .addStep(JIRA_STEP)
    .addStep(VSCODE_STEP)
    .build();
}

/**
 * Get a step by its short name (A, B, C or Download, JIRA, VSCode)
 */
export function getStepByName(
  name: string
): Omit<FlowStep, "id"> | undefined {
  const normalizedName = name.toUpperCase();
  switch (normalizedName) {
    case "A":
    case "DOWNLOAD":
      return DOWNLOAD_STEP;
    case "B":
    case "JIRA":
      return JIRA_STEP;
    case "C":
    case "VSCODE":
      return VSCODE_STEP;
    default:
      return undefined;
  }
}

/**
 * Map step names to short labels
 */
export const STEP_LABELS: Record<string, string> = {
  Download: "A",
  JIRA: "B",
  VSCode: "C",
};

/**
 * Map short labels to step names
 */
export const LABEL_TO_STEP: Record<string, string> = {
  A: "Download",
  B: "JIRA",
  C: "VSCode",
};
