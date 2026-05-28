import { GitHubIcon } from "./icons";
import { buttonVariants } from "./ui/button";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";
import { StarFilledIcon } from "@radix-ui/react-icons";

const REPO_URL = "https://github.com/Invoke-Pub-Sec-AI/surf";

export function RepoBanner() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View Invoke Surf repository on GitHub"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "bg-fg overflow-hidden hover:scale-[1.01] hover:bg-fg/80 font-light px-3 py-1.5",
        "gap-2 w-fit flex items-center shadow-sm ml-auto border",
        "transition-all duration-300 group relative",
        "before:absolute before:w-full before:h-full before:bg-[radial-gradient(circle_at_50%_-50%,rgba(0,0,0,0.1),transparent_70%)] dark:before:bg-[radial-gradient(circle_at_50%_-100%,rgba(0,0,0,0.1),transparent_70%)] before:pointer-events-none"
      )}
    >
      <GitHubIcon className="w-4 h-4 text-bg" aria-hidden="true" />
      <Separator
        orientation="vertical"
        className="h-6 bg-[hsl(var(--border))]"
        aria-hidden="true"
      />
      <p className="text-xs md:text-sm font-light text-bg tracking-wide">
        Star on GitHub
      </p>
      <div
        className="flex items-center gap-1 text-bg/80"
        role="status"
        aria-live="polite"
      >
        <StarFilledIcon
          className="w-4 h-4 text-bg transition-transform group-hover:rotate-[90deg] duration-200 ease-in-out"
          aria-label="GitHub stars"
        />
      </div>
    </a>
  );
}
