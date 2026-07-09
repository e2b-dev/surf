import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Template } from "e2b";

/**
 * Surf desktop sandbox template.
 *
 * This is a faithful mirror of E2B's official `desktop` template
 * (github.com/e2b-dev/desktop → template/template.py). The ONLY difference is
 * files/wallpaper.png, which carries the new E2B logo instead of the old star
 * mark. Every other step — base image, packages, noVNC, browsers, XFCE config —
 * is identical, so existing demos behave exactly as before.
 *
 * Keep this in sync with the upstream template.py when bumping the base.
 */
const filesDir = join(dirname(fileURLToPath(import.meta.url)), "files");

export const template = Template({ fileContextPath: filesDir })
  .fromImage("ubuntu:22.04")
  .setUser("root")
  .setWorkdir("/")
  .setEnvs({
    // Avoid system prompts
    DEBIAN_FRONTEND: "noninteractive",
    DEBIAN_PRIORITY: "high",
    // Pip settings
    PIP_DEFAULT_TIMEOUT: "100",
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_NO_CACHE_DIR: "1",
  })
  // Initial system setup and packages
  .runCmd("yes | unminimize")
  .aptInstall([
    "xserver-xorg",
    "x11-xserver-utils",
    "xvfb",
    "x11-utils",
    "xauth",
    "xfce4",
    "xfce4-goodies",
    "util-linux",
    "sudo",
    "curl",
    "git",
    "wget",
    "python3-pip",
    "xdotool",
    "scrot",
    "ffmpeg",
    "x11vnc",
    "net-tools",
    "netcat",
    "x11-apps",
    "libreoffice",
    "xpdf",
    "gedit",
    "xpaint",
    "tint2",
    "galculator",
    "pcmanfm",
    "software-properties-common",
    "apt-transport-https",
    "libgtk-3-bin",
  ])
  .pipInstall("numpy")
  // Setup NoVNC and websockify
  .gitClone("https://github.com/e2b-dev/noVNC.git", "/opt/noVNC", {
    branch: "e2b-desktop",
  })
  .makeSymlink("/opt/noVNC/vnc.html", "/opt/noVNC/index.html")
  .gitClone(
    "https://github.com/novnc/websockify.git",
    "/opt/noVNC/utils/websockify",
    { branch: "v0.12.0" }
  )
  // Install browsers and set up repositories
  .runCmd([
    "add-apt-repository ppa:mozillateam/ppa",
    "wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -",
    'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list',
    "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | apt-key add -",
    'add-apt-repository -y "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main"',
    "apt-get update",
  ])
  // Install browsers and VS Code
  .aptInstall(["firefox-esr", "google-chrome-stable", "code"])
  // Configure system settings
  .makeSymlink(
    "/usr/bin/xfce4-terminal.wrapper",
    "/etc/alternatives/x-terminal-emulator",
    { force: true }
  )
  .runCmd("update-alternatives --set x-www-browser /usr/bin/firefox-esr")
  .makeDir("/home/user/.config/Code/User")
  .makeDir("/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/")
  .makeDir("/home/user/.config/autostart")
  .runCmd("update-desktop-database /usr/share/applications/")
  // Copy all configuration files
  .copyItems([
    {
      src: "google-chrome.desktop",
      dest: "/usr/share/applications/google-chrome.desktop",
    },
    { src: "settings.json", dest: "/home/user/.config/Code/User/settings.json" },
    // New E2B logo wallpaper (the only asset that differs from upstream).
    { src: "wallpaper.png", dest: "/usr/share/backgrounds/xfce/wallpaper.png" },
    {
      src: "xfce4-desktop.xml",
      dest: "/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml",
    },
    {
      src: "screensaver.desktop",
      dest: "/home/user/.config/autostart/screensaver.desktop",
    },
    {
      src: "firefox-policies.json",
      dest: "/usr/lib/firefox-esr/distribution/policies.json",
    },
    {
      src: "firefox-autoconfig.js",
      dest: "/usr/lib/firefox-esr/defaults/pref/autoconfig.js",
    },
    { src: "firefox.cfg", dest: "/usr/lib/firefox-esr/firefox.cfg" },
  ])
  // Template with user and workdir set (matches upstream template_with_user_workdir)
  .setUser("user")
  .setWorkdir("/home/user");
