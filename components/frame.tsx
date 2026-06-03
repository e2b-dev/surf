import { cn } from "@/lib/utils";
import Scanline from "@/components/scanline";

interface FrameProps {
  children: React.ReactNode;
  classNames?: {
    wrapper?: string;
    frame?: string;
  };
  showChrome?: boolean;
}

export default function Frame({
  children,
  classNames,
  showChrome = true,
}: FrameProps) {
  return (
    <div
      className={cn("relative flex h-fit w-fit pb-4.5", classNames?.wrapper)}
    >
      {showChrome && (
        <div className="absolute inset-x-[16px] top-1 bottom-0 h-auto w-auto rounded-xs border">
          <Scanline />
        </div>
      )}
      <div
        className={cn(
          "bg-bg relative w-full rounded-xs border shadow-md",
          classNames?.frame
        )}
      >
        {children}
      </div>
    </div>
  );
}
