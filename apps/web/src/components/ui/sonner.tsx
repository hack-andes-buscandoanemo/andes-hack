import type { ToasterProps } from "sonner";

import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  AlertCircleIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

const CircleCheckIcon = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={CheckmarkCircle02Icon} {...props} />
);
const InfoIcon = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={InformationCircleIcon} {...props} />
);
const Loader2Icon = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={Loading03Icon} {...props} />
);
const OctagonXIcon = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={AlertCircleIcon} {...props} />
);
const TriangleAlertIcon = (props: Omit<HugeiconsIconProps, "icon">) => (
  <HugeiconsIcon icon={Alert02Icon} {...props} />
);

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
