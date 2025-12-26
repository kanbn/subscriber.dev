import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Radio, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

interface SideNavigationProps {
  user?: { email?: string | null; image?: string | null };
  onCloseSideNav?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function SideNavigation({
  user,
  onCloseSideNav,
}: SideNavigationProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInitialised, setIsInitialised] = useState(false);

  useEffect(() => {
    const savedState = localStorage.getItem("subscriber_sidebar-collapsed");
    if (savedState !== null) {
      setIsCollapsed(JSON.parse(savedState) as boolean);
    }
    setIsInitialised(true);
  }, []);

  useEffect(() => {
    if (isInitialised) {
      localStorage.setItem(
        "subscriber_sidebar-collapsed",
        JSON.stringify(isCollapsed),
      );
    }
  }, [isCollapsed, isInitialised]);

  const handleLogout = async () => {
    await authClient.signOut();
  };

  const navigation: NavItem[] = [
    {
      name: t`Subscribers`,
      href: "/subscribers",
      icon: Users,
    },
    {
      name: t`Broadcasts`,
      href: "/broadcasts",
      icon: Radio,
    },
    {
      name: t`Settings`,
      href: "/settings",
      icon: Settings,
    },
  ];

  return (
    <nav
      className={cn(
        "border-border bg-card flex h-full flex-col justify-between pr-3 transition-all duration-300",
        isCollapsed ? "md:w-16" : "md:w-64",
      )}
    >
      <div>
        {/* Workspace Menu - placeholder for now */}
        {!isCollapsed && (
          <div className="mb-4 px-2">
            <div className="text-muted-foreground text-xs font-medium uppercase">
              {t`Workspace`}
            </div>
            {/* TODO: Add workspace selector here */}
          </div>
        )}

        <ul role="list" className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname ? pathname.includes(item.href) : false;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={onCloseSideNav}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                    isCollapsed && "justify-center px-2",
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "hover:bg-muted/30 text-muted-foreground hover:text-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              isCollapsed && "justify-center px-2",
            )}
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.email ?? ""}
                width={20}
                height={20}
                className="size-6 shrink-0 rounded-full"
              />
            ) : (
              <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                <Users className="size-4" />
              </div>
            )}
            {!isCollapsed && (
              <span className="truncate text-sm">{user?.email}</span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleLogout}>
              {t`Sign out`}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
