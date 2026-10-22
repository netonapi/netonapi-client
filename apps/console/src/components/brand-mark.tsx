import Image from "next/image";
import { cn } from "@neton/application-client-kit";

/** [className] 给出时替换默认的尺寸与投影（cn 不做 tailwind-merge，同名工具类不能靠覆盖）。 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#101828]",
        className ?? "h-9 w-9 shadow-[0_8px_24px_rgba(37,99,235,0.2)]",
      )}
      aria-hidden="true"
    >
      <Image src="/neton-icon.png" alt="" fill sizes="36px" className="object-cover" priority />
    </span>
  );
}
