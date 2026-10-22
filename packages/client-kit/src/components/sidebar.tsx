"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as DialogPrimitive, Slot } from "radix-ui";
import { PanelLeft } from "lucide-react";
import { cn } from "../cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/*
 * shadcn/ui Sidebar 的精简移植（https://ui.shadcn.com/docs/components/sidebar）：同样的组件名、
 * `data-*` 属性与 `group-data-[collapsible=icon]` 写法，只保留用户端需要的 inset + icon 收起形态。
 *
 * 桌面端侧栏常驻、可收成图标栏（⌘/Ctrl+B 切换，状态记在本机）；窄屏改为左侧抽屉。
 */

const SIDEBAR_STORAGE_KEY = "neton-client-sidebar";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const MOBILE_QUERY = "(max-width: 1023px)";

interface SidebarContextValue {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen(open: boolean): void;
  openMobile: boolean;
  setOpenMobile(open: boolean): void;
  isMobile: boolean;
  toggleSidebar(): void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar 必须在 SidebarProvider 内使用");
  return context;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function SidebarProvider({ className, style, children, ...props }: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  const [open, setOpenState] = React.useState(true);
  const [openMobile, setOpenMobile] = React.useState(false);

  React.useEffect(() => {
    setOpenState(localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "collapsed");
  }, []);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? "expanded" : "collapsed"); } catch { /* 隐私模式 */ }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const value = React.useMemo<SidebarContextValue>(() => ({
    state: open ? "expanded" : "collapsed",
    open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar,
  }), [open, setOpen, openMobile, isMobile, toggleSidebar]);

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "3rem", ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex h-svh w-full overflow-hidden bg-[var(--sidebar)]", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  collapsible = "icon",
  className,
  children,
  mobileLabel,
  ...props
}: React.ComponentProps<"div"> & { collapsible?: "icon" | "none"; /** 窄屏抽屉的无障碍标题。 */ mobileLabel: string }) {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <DialogPrimitive.Root open={openMobile} onOpenChange={setOpenMobile}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-[var(--overlay)]" />
          <DialogPrimitive.Content
            data-slot="sidebar"
            data-mobile="true"
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-[130] flex w-[18rem] max-w-[85vw] flex-col bg-[var(--sidebar)] p-2 text-[var(--sidebar-foreground)] shadow-[var(--shadow-md)] outline-none"
          >
            <DialogPrimitive.Title className="sr-only">{mobileLabel}</DialogPrimitive.Title>
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant="inset"
      className={cn(
        "group peer hidden shrink-0 flex-col p-2 text-[var(--sidebar-foreground)] transition-[width] duration-200 ease-linear lg:flex",
        "w-[var(--sidebar-width)] data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarTrigger({ className, onClick, label, ...props }: React.ComponentProps<"button"> & { label: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-label={label}
      title={label}
      onClick={(event) => { onClick?.(event); toggleSidebar(); }}
      className={cn(
        "-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
      {...props}
    >
      <PanelLeft className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** 主内容区：inset 形态下是侧栏底色上的一张圆角卡片。 */
export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--background)]",
        "lg:my-2 lg:mr-2 lg:rounded-xl lg:border lg:border-[var(--sidebar-border)] lg:shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden group-data-[collapsible=icon]:overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-[var(--muted-foreground)] transition-[margin,opacity] duration-200 ease-linear",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

export const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-[width,height,padding]",
    "hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[active=true]:bg-[var(--sidebar-active)] data-[active=true]:font-medium data-[active=true]:text-[var(--sidebar-foreground)]",
    "data-[state=open]:hover:bg-[var(--sidebar-accent)]",
    // cn 不做 tailwind-merge：收起时的内边距按尺寸写在各自变体里，避免同名工具类互相冲突
    "group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!w-8",
    "[&>span:last-child]:truncate [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      size: {
        default: "h-8 text-sm group-data-[collapsible=icon]:!p-2",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/**
 * 菜单按钮。`asChild` 时把样式交给子元素（如工作区链接 `<a>`）。收起成图标栏时，`tooltip` 作为悬停提示。
 */
export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  size,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean; isActive?: boolean; tooltip?: string } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button";
  const { state, isMobile } = useSidebar();
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-size={size ?? "default"}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      {...props}
    />
  );
  if (!tooltip || state !== "collapsed" || isMobile) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-[var(--sidebar-border)] px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-sub-item" className={cn("group/menu-sub-item relative", className)} {...props} />;
}

export function SidebarMenuSubButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean; isActive?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-[var(--sidebar-foreground)] outline-none",
        "hover:bg-[var(--sidebar-accent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "data-[active=true]:bg-[var(--sidebar-active)] data-[active=true]:font-medium [&>span:last-child]:truncate [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
