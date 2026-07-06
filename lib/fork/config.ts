/**
 * Configuration for the "Fork an authenticated agent" demo.
 *
 * The demo shows off E2B sandbox snapshots: a single agent logs into a real
 * auth-gated website, we snapshot its sandbox (full memory + filesystem,
 * including the live browser session), and then fork that snapshot into N
 * independent sandboxes. Every fork resumes *already authenticated* and
 * continues exploring the site in parallel — no fork ever logs in again.
 *
 * We target Hacker News (news.ycombinator.com), a genuinely auth-gated site.
 * Credentials live in .env.local (DEMO_SITE_USERNAME / DEMO_SITE_PASSWORD) and
 * are only ever read on the server. The password is never returned to the
 * client: the browser triggers the login run by the opaque id below, and the
 * server builds + consumes the auth prompt itself (see app/api/chat/route.ts).
 */

export const FORK_COUNT = 3;

/**
 * Opaque identifier the client sends to /api/chat to run the authentication
 * step. The route resolves it to a server-built prompt containing the password,
 * so the credential never crosses the server→client trust boundary.
 */
export const FORK_AUTH_PROMPT_ID = "fork-auth";

/** Resolution used for the primary sandbox and every fork. */
export const FORK_RESOLUTION: [number, number] = [1024, 768];

export const DEMO_SITE = {
  label: "Hacker News",
  host: "news.ycombinator.com",
  loginUrl: "https://news.ycombinator.com/login",
  homeUrl: "https://news.ycombinator.com/news",
} as const;

export interface ForkTask {
  /** Short label shown on the fork's pane. */
  title: string;
  /** One-line description of what this fork explores. */
  summary: string;
  /** The full instruction handed to the forked agent. */
  prompt: string;
}

export interface ForkDemoConfig {
  siteLabel: string;
  username: string;
  forkTasks: ForkTask[];
}

/**
 * Task the primary agent runs to establish an authenticated session. This
 * embeds the plaintext password, so it MUST only ever be built and consumed on
 * the server (it is never included in ForkDemoConfig / any client payload).
 */
export function buildAuthTask(username: string, password: string): string {
  return `Open Firefox if it isn't already open. Go to ${DEMO_SITE.loginUrl}.
There are two forms on the page: "Login" (top) and "Create Account" (bottom). Use the LOGIN form at the top.
Click the username field under "Login", type "${username}". Click the password field, type "${password}". Then click the "login" button directly under those fields.
You should land on the Hacker News front page and the top bar should now show "${username}" with a "logout" link on the right. Stop once you confirm you are logged in.`;
}

/**
 * Per-fork exploration tasks. Each fork starts from the authenticated snapshot,
 * first proves the inherited session (the top bar shows the logged-in user),
 * then explores a different authenticated page — so all forks work in parallel
 * while sharing the same authenticated starting state. No password is included;
 * the session is inherited from the snapshot.
 */
export function buildForkTasks(username: string): ForkTask[] {
  const inherited = `You are a fork of an agent that is already logged in to Hacker News as "${username}" in this exact browser. A valid session is already active — do NOT log in again. Confirm the top bar shows "${username}" and a "logout" link.`;

  return [
    {
      title: "Profile",
      summary: "Open the logged-in user's profile page",
      prompt: `${inherited}
Then navigate to https://news.ycombinator.com/user?id=${username} and report the account's karma and created date.`,
    },
    {
      title: "Your threads",
      summary: "Open the auth-gated threads page",
      prompt: `${inherited}
Then click the "threads" link in the top bar (or go to https://news.ycombinator.com/threads?id=${username}). Report what the page shows for this account.`,
    },
    {
      title: "Upvote view",
      summary: "Browse the front page as the logged-in user",
      prompt: `${inherited}
Then go to https://news.ycombinator.com/news. Confirm each story row shows an upvote triangle (visible only when logged in) and report the title of the top story.`,
    },
  ];
}
