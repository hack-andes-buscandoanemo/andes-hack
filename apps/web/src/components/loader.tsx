import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

const Loader2 = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={Loading03Icon} {...props} />
);

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <Loader2 className="animate-spin" />
    </div>
  );
}
