import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import SideNavigation from "./SideNavigation";

interface DashboardProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  hasRightPanel?: boolean;
}

export default function Dashboard({
  children,
  rightPanel,
  hasRightPanel = false,
}: DashboardProps) {
  const { resolvedTheme } = useTheme();
  const { data: session, isPending: sessionLoading } = authClient.useSession();

  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const sideNavRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const sideNavButtonRef = useRef<HTMLButtonElement>(null);
  const rightPanelButtonRef = useRef<HTMLButtonElement>(null);

  const toggleSideNav = () => {
    setIsSideNavOpen(!isSideNavOpen);
    if (!isSideNavOpen) {
      setIsRightPanelOpen(false);
    }
  };

  const closeSideNav = () => {
    setIsSideNavOpen(false);
  };

  const toggleRightPanel = () => {
    setIsRightPanelOpen(!isRightPanelOpen);
    if (!isRightPanelOpen) {
      setIsSideNavOpen(false);
    }
  };

  // Close side nav when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sideNavRef.current &&
        !sideNavRef.current.contains(event.target as Node) &&
        sideNavButtonRef.current &&
        !sideNavButtonRef.current.contains(event.target as Node) &&
        isSideNavOpen
      ) {
        setIsSideNavOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSideNavOpen]);

  // Close right panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        rightPanelRef.current &&
        !rightPanelRef.current.contains(event.target as Node) &&
        rightPanelButtonRef.current &&
        !rightPanelButtonRef.current.contains(event.target as Node) &&
        isRightPanelOpen
      ) {
        setIsRightPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRightPanelOpen]);

  const isDarkMode = resolvedTheme === "dark";

  return (
    <>
      <style jsx global>{`
        html {
          height: 100vh;
          overflow: hidden;
          min-width: 320px;
          background-color: ${!isDarkMode
            ? "hsl(var(--background))"
            : "hsl(var(--background))"};
        }
      `}</style>
      <div className="bg-background relative flex h-screen flex-col md:p-3">
        {/* Mobile Header */}
        <div className="border-border bg-card flex h-12 items-center justify-between border-b px-3 md:hidden">
          <Button
            ref={sideNavButtonRef}
            variant="ghost"
            size="icon"
            onClick={toggleSideNav}
          >
            {isSideNavOpen ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <PanelLeftOpen className="size-5" />
            )}
          </Button>

          {hasRightPanel && (
            <Button
              ref={rightPanelButtonRef}
              variant="ghost"
              size="icon"
              onClick={toggleRightPanel}
            >
              {isRightPanelOpen ? (
                <PanelRightClose className="size-5" />
              ) : (
                <PanelRightOpen className="size-5" />
              )}
            </Button>
          )}
        </div>

        <div className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full md:h-[calc(100dvh-1.5rem)]">
          <div
            ref={sideNavRef}
            className={cn(
              "fixed top-12 z-40 h-[calc(100dvh-3rem)] w-[calc(100vw-1.5rem)] transform transition-transform duration-300 ease-in-out md:relative md:top-0 md:h-full md:w-auto md:translate-x-0",
              isSideNavOpen
                ? "translate-x-0"
                : "-translate-x-full md:translate-x-0",
            )}
          >
            <SideNavigation
              user={{
                email: session?.user.email,
                image: session?.user.image,
              }}
              isLoading={sessionLoading}
              onCloseSideNav={closeSideNav}
            />
          </div>

          <div className="md:border-border bg-background-50 relative h-full min-h-0 w-full overflow-hidden md:rounded-lg md:border">
            <div className="relative flex h-full min-h-0 w-full overflow-hidden">
              <div className="h-full w-full overflow-y-auto">{children}</div>

              {/* Mobile Right Panel */}
              {hasRightPanel && rightPanel && (
                <div
                  ref={rightPanelRef}
                  className={cn(
                    "border-border bg-muted fixed right-0 top-12 z-40 h-[calc(100dvh-3rem)] w-80 transform border-l transition-transform duration-300 ease-in-out md:hidden",
                    isRightPanelOpen ? "translate-x-0" : "translate-x-full",
                  )}
                >
                  <div className="h-full">{rightPanel}</div>
                </div>
              )}

              {/* Desktop Right Panel */}
              {hasRightPanel && rightPanel && (
                <div className="hidden md:block">{rightPanel}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
