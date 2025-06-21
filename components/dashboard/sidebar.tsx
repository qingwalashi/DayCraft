"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// 导航项定义
type NavItem = {
  name: string;
  href: string;
  icon: (props: { className: string }) => JSX.Element;
};

// 图标组件
const Icons = {
  Overview: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  ),
  Projects: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 20h20" />
      <path d="M5 14h.01" />
      <path d="M12 14h.01" />
      <path d="M19 14h.01" />
      <path d="M5 14v6" />
      <path d="M12 14v6" />
      <path d="M19 14v6" />
      <path d="M12 4v10" />
      <path d="m9 7 3-3 3 3" />
    </svg>
  ),
  Reports: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  Statistics: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  ),
  Settings: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Logout: ({ className }: { className: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  ),
};

// 导航项配置
const navigation: NavItem[] = [
  { name: "概览", href: "/dashboard/overview", icon: Icons.Overview },
  { name: "项目", href: "/dashboard/projects", icon: Icons.Projects },
  { name: "日报", href: "/dashboard/reports", icon: Icons.Reports },
  { name: "统计", href: "/dashboard/statistics", icon: Icons.Statistics },
  { name: "设置", href: "/dashboard/settings", icon: Icons.Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  return (
    <aside
      className={`${
        expanded ? "w-64" : "w-16"
      } bg-white h-screen transition-width duration-300 border-r border-gray-200`}
    >
      <div className="px-4 py-5 flex items-center justify-between">
        {expanded && (
          <div className="text-xl font-semibold text-gray-800">DayCraft</div>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {expanded ? (
              <path d="m15 18-6-6 6-6" />
            ) : (
              <path d="m9 18 6-6-6-6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="mt-6">
        <ul className="space-y-2 px-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`
                  flex items-center px-3 py-2 rounded-md text-sm
                  ${
                    pathname === item.href
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }
                `}
              >
                <item.icon
                  className={`h-5 w-5 ${
                    pathname === item.href
                      ? "text-blue-700"
                      : "text-gray-500"
                  }`}
                />
                {expanded && <span className="ml-3">{item.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="absolute bottom-4 px-2 w-full">
        <button className="flex items-center px-3 py-2 w-full rounded-md text-sm text-gray-700 hover:bg-gray-100">
          <Icons.Logout className="h-5 w-5 text-gray-500" />
          {expanded && <span className="ml-3">退出登录</span>}
        </button>
      </div>
    </aside>
  );
} 