"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  CalendarIcon, 
  FileTextIcon, 
  LayoutDashboardIcon, 
  LogOutIcon, 
  MenuIcon, 
  FolderIcon,
  Settings2Icon,
  ShieldCheckIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, UserProfile as DBUserProfile } from "@/lib/supabase/client";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string[];
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  subItems?: { name: string; href: string }[];
}

// 动态导航项配置
const getNavigation = (role: string[] = []) => {
  const isAdmin = role.includes('admin');
  const isUser = role.includes('user');
  // 仅 admin 且不是双重角色时，只显示系统管理菜单
  if (isAdmin && !isUser && role.length === 1) {
    return [
      { name: "系统管理", href: "/dashboard/admin", icon: ShieldCheckIcon, subItems: undefined }
    ];
  }
  // 仅 user 时，只显示普通菜单
  if (isUser && !isAdmin && role.length === 1) {
    return [
      { name: "概览", href: "/dashboard/overview", icon: LayoutDashboardIcon },
      { 
        name: "项目", 
        href: "/dashboard/projects", // 修改为项目管理页面链接
        icon: FolderIcon,
        subItems: [
          { name: "项目管理", href: "/dashboard/projects" },
          { name: "工作分解", href: "/dashboard/work-breakdown" },
          { name: "进度管理", href: "/dashboard/projects/progress" }
        ]
      },
      { name: "待办管理", href: "/dashboard/todos", icon: CalendarIcon },
      {
        name: "报告",
        href: "/dashboard/daily-reports", // 修改为实际链接而不是"#"
        icon: FileTextIcon,
        subItems: [
          { name: "日报", href: "/dashboard/daily-reports" },
          { name: "周报/月报", href: "/dashboard/reports" }
        ]
      },
      { name: "设置", href: "/dashboard/settings", icon: Settings2Icon },
    ];
  }
  // 同时有 admin 和 user 时，显示普通菜单+系统管理
  if (isAdmin && isUser) {
    return [
      { name: "概览", href: "/dashboard/overview", icon: LayoutDashboardIcon },
      { 
        name: "项目", 
        href: "/dashboard/projects", // 修改为实际链接而不是"#"
        icon: FolderIcon,
        subItems: [
          { name: "项目管理", href: "/dashboard/projects" },
          { name: "工作分解", href: "/dashboard/work-breakdown" },
          { name: "进度管理", href: "/dashboard/projects/progress" }
        ]
      },
      { name: "待办管理", href: "/dashboard/todos", icon: CalendarIcon },
      {
        name: "报告",
        href: "/dashboard/daily-reports", // 修改为实际链接而不是"#"
        icon: FileTextIcon,
        subItems: [
          { name: "日报", href: "/dashboard/daily-reports" },
          { name: "周报/月报", href: "/dashboard/reports" }
        ]
      },
      { name: "设置", href: "/dashboard/settings", icon: Settings2Icon },
      { name: "系统管理", href: "/dashboard/admin", icon: ShieldCheckIcon, subItems: undefined },
    ];
  }
  // 其他情况（无角色或未知角色）
  return [];
};

// 角色标签映射
const roleLabelMap: Record<string, string> = {
  admin: '管理员',
  user: '普通用户',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 默认在移动端关闭侧边栏
  const [sidebarExpanded, setSidebarExpanded] = useState(true); // 控制侧边栏展开/折叠
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const supabase = createClient();
  
  // 添加一个标记，避免重复获取用户资料
  const [profileFetched, setProfileFetched] = useState(false);

  // 从 localStorage 加载侧边栏状态
  useEffect(() => {
    setIsMounted(true);
    const savedExpanded = localStorage.getItem("sidebarExpanded");
    if (savedExpanded !== null) {
      setSidebarExpanded(savedExpanded === "true");
    }
  }, []);

  // 根据屏幕大小设置侧边栏默认状态
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md 断点
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    // 初始化时执行一次
    handleResize();

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 在路由变化时关闭移动端侧边栏
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    // 只有在认证状态确定后再检查用户是否已登录
    if (!authLoading) {
      if (!user) {
        console.log('未检测到已登录用户，重定向到登录页');
        router.replace('/login');
        return;
      }
      
      // 用户已登录，且用户资料未获取过，则获取用户资料
      if (!profileFetched && !userProfile) {
        fetchUserProfile();
      } else if (userProfile) {
        // 如果已有用户资料，直接结束加载状态
        setIsLoading(false);
      }
    }
  }, [user, authLoading, profileFetched, userProfile]);

  // 从 Supabase 获取用户资料信息
  const fetchUserProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 总是从数据库获取最新资料
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('用户资料不存在，尝试创建...');
          const userProfileData = {
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.name || user.email?.split('@')[0] || '用户',
            avatar_url: user.user_metadata?.avatar_url || null,
            role: ['user']
          };
          const { data: newProfile, error: insertError } = await supabase
            .from('user_profiles')
            .upsert(userProfileData)
            .select('*')
            .single();
          if (insertError) {
            console.error('创建用户资料失败:', insertError);
            const basicProfile = {
              id: user.id,
              name: user.email?.split('@')[0] || '用户',
              email: user.email || '',
              role: ['user']
            };
            setUserProfile(basicProfile);
            sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
            console.log('当前用户角色:', basicProfile.role);
          } else if (newProfile) {
            const profile = {
              id: user.id,
              name: (newProfile.full_name as string) || user.email?.split('@')[0] || '用户',
              email: (newProfile.email as string) || user.email || '',
              role: Array.isArray(newProfile.role) ? newProfile.role : [newProfile.role]
            };
            setUserProfile(profile);
            sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(profile));
            console.log('当前用户角色:', profile.role);
          }
        } else {
          console.error('获取用户资料错误:', error);
          const basicProfile = {
            id: user.id,
            name: user.email?.split('@')[0] || '用户',
            email: user.email || '',
            role: ['user']
          };
          setUserProfile(basicProfile);
          sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
          console.log('当前用户角色:', basicProfile.role);
        }
      } else if (data) {
        const profile = {
          id: user.id,
          name: (data.full_name as string) || user.email?.split('@')[0] || '用户',
          email: (data.email as string) || user.email || '',
          role: Array.isArray(data.role) ? data.role : [data.role]
        };
        setUserProfile(profile);
        sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(profile));
        console.log('当前用户角色:', profile.role);
      }
      setProfileFetched(true);
    } catch (error) {
      console.error('处理用户资料时出错:', error);
      if (user) {
        const basicProfile = {
          id: user.id,
          name: user.email?.split('@')[0] || '用户',
          email: user.email || '',
          role: ['user']
        };
        setUserProfile(basicProfile);
        sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
        console.log('当前用户角色:', basicProfile.role);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // 切换侧边栏展开/折叠状态
  const toggleSidebarExpand = () => {
    const newState = !sidebarExpanded;
    setSidebarExpanded(newState);
    if (isMounted) {
      localStorage.setItem("sidebarExpanded", String(newState));
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // 在组件内，动态获取导航项
  const navigation = getNavigation(userProfile?.role);

  // 处理加载状态
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 移动端侧边栏切换按钮 - 固定在右下角 */}
      <button
        onClick={toggleSidebar}
        className="fixed z-50 bottom-4 right-4 p-2 rounded-full bg-blue-600 text-white shadow-lg md:hidden"
        aria-label={isSidebarOpen ? "关闭菜单" : "打开菜单"}
      >
        {isSidebarOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
      </button>

      {/* 侧边栏 - 移动端使用绝对定位覆盖 */}
      <div
        className={`fixed inset-y-0 left-0 transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          sidebarExpanded ? "w-64" : "w-16"
        } bg-white border-r border-gray-200 transition-all duration-300 ease-in-out md:relative md:translate-x-0 z-40 overflow-hidden`}
      >
        <div className="flex flex-col h-full">
          {/* 侧边栏头部 */}
          <div className={`px-4 py-5 flex items-center ${sidebarExpanded ? "justify-between" : "justify-center"}`}>
            {sidebarExpanded && (
              <div className="text-xl font-semibold text-gray-800 whitespace-nowrap">
                DayCraft
              </div>
            )}
            {/* PC端折叠/展开按钮 */}
            <button
              onClick={toggleSidebarExpand}
              className={`p-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors ${!sidebarExpanded && "w-10 h-10 flex items-center justify-center"}`}
              aria-label={sidebarExpanded ? "折叠侧边栏" : "展开侧边栏"}
              title={sidebarExpanded ? "折叠侧边栏" : "展开侧边栏"}
            >
              {sidebarExpanded ? <ChevronLeftIcon size={20} /> : <ChevronRightIcon size={20} />}
            </button>
            {/* 移动端关闭按钮 */}
            {sidebarExpanded && (
              <button 
                onClick={toggleSidebar} 
                className="p-1 rounded-md text-gray-500 md:hidden ml-1"
                aria-label="关闭菜单"
              >
                <XIcon size={20} />
              </button>
            )}
          </div>

          {/* 导航菜单 */}
          <nav className="px-2 py-4">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center ${sidebarExpanded ? "px-2" : "justify-center"} py-2.5 text-sm font-medium rounded-md group
                      transition-all duration-200 ease-in-out
                      ${
                        pathname === item.href || (item.subItems && item.subItems.some(sub => pathname === sub.href))
                          ? "bg-blue-100 text-blue-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }
                    `}
                    onClick={(e) => {
                      if (window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                      // 如果有子项，不阻止默认行为，让链接正常跳转
                    }}
                    title={!sidebarExpanded ? item.name : ""}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${
                      pathname === item.href || (item.subItems && item.subItems.some(sub => pathname === sub.href))
                        ? "text-blue-700"
                        : "text-gray-500 group-hover:text-gray-700"
                    }`} />
                    <span 
                      className={`ml-3 whitespace-nowrap transition-all duration-300 ${
                        sidebarExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                      }`}
                    >
                      {item.name}
                    </span>
                  </Link>
                  {sidebarExpanded && item.subItems && item.subItems.length > 0 && (
                    <ul className="ml-6 mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <li key={subItem.href}>
                          <Link
                            href={subItem.href}
                            className={`flex items-center px-2 py-1.5 text-sm font-medium rounded-md ${
                              pathname === subItem.href
                                ? "bg-blue-50 text-blue-700"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                            onClick={(e) => {
                              if (window.innerWidth < 768) {
                                setIsSidebarOpen(false);
                              }
                              // 阻止事件冒泡，避免触发父菜单项的点击处理程序
                              e.stopPropagation();
                            }}
                          >
                            <span className="ml-3">{subItem.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* 侧边栏底部 */}
          <div className="mt-auto p-4 border-t border-gray-200">
            {sidebarExpanded && (
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                    {userProfile && userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "U"}
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">{userProfile?.name || "用户"}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[150px]">{userProfile?.email || ""}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className={`flex items-center text-gray-500 hover:text-gray-700 w-full rounded-md hover:bg-gray-100 transition-colors group ${sidebarExpanded ? "py-2 px-2" : "py-3 justify-center"}`}
              title={!sidebarExpanded ? "退出登录" : ""}
            >
              <LogOutIcon className="h-6 w-6 text-gray-500 group-hover:text-gray-700" />
              <span 
                className={`ml-3 whitespace-nowrap transition-all duration-300 ${
                  sidebarExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                }`}
              >
                退出登录
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* 顶部导航栏 */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {/* 移动端显示菜单按钮 */}
                <button 
                  onClick={toggleSidebar} 
                  className="p-1 mr-2 rounded-md text-gray-500 md:hidden"
                  aria-label="打开菜单"
                >
                  <MenuIcon size={24} />
                </button>
                <h1 className="text-lg font-medium text-gray-900 truncate">
                  {navigation.find((item) => pathname.startsWith(item.href))?.name || "仪表盘"}
                </h1>
              </div>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 hidden sm:inline-block">
                  {userProfile?.name || "用户"}
                </span>
                {/* 新增：显示角色标签，适配移动端 */}
                <span className="flex gap-1 ml-2">
                  {userProfile?.role?.length
                    ? userProfile.role.map((r) => (
                        <span
                          key={r}
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap"
                          style={{ minWidth: 48, textAlign: 'center' }}
                        >
                          {roleLabelMap[r] || r}
                        </span>
                      ))
                    : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">无角色</span>
                    )}
                </span>
                {/* 移动端显示用户头像 */}
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 sm:hidden ml-2">
                  {userProfile && userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "U"}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 页面内容 - 调整内边距以适应移动端 */}
        <main className="flex-1 overflow-auto bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* 移动端侧边栏背景遮罩 */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-50 z-30 md:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        ></div>
      )}
    </div>
  );
} 