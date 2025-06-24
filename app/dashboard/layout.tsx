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
  BarChartIcon,
  XIcon 
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, UserProfile as DBUserProfile } from "@/lib/supabase/client";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  subItems?: { name: string; href: string }[];
}

// 导航项配置
const navigation: NavItem[] = [
  { name: "概览", href: "/dashboard/overview", icon: LayoutDashboardIcon },
  { name: "项目", href: "/dashboard/projects", icon: FolderIcon },
  { 
    name: "报告", 
    href: "#",
    icon: FileTextIcon,
    subItems: [
      { name: "日报", href: "/dashboard/daily-reports" },
      { name: "周报/月报", href: "/dashboard/reports" }
    ]
  },
  { name: "设置", href: "/dashboard/settings", icon: Settings2Icon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 默认在移动端关闭侧边栏
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const supabase = createClient();
  
  // 添加一个标记，避免重复获取用户资料
  const [profileFetched, setProfileFetched] = useState(false);

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
      // 首先尝试从sessionStorage获取缓存的用户资料
      const cachedProfile = sessionStorage.getItem(`user_profile_${user.id}`);
      if (cachedProfile) {
        const parsedProfile = JSON.parse(cachedProfile);
        setUserProfile(parsedProfile);
        setProfileFetched(true);
        setIsLoading(false);
        return;
      }
      
      // 如果没有缓存，则从数据库获取
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        // 如果是没有找到记录的错误，则尝试创建新用户资料
        if (error.code === 'PGRST116') {
          console.log('用户资料不存在，尝试创建...');
          
          // 创建用户资料对象
          const userProfileData = {
            id: user.id, 
            email: user.email || '',
            full_name: user.user_metadata?.name || user.email?.split('@')[0] || '用户',
            avatar_url: user.user_metadata?.avatar_url || null,
            role: 'user' // 明确设置角色
          };
          
          // 创建新的用户资料
          const { data: newProfile, error: insertError } = await supabase
            .from('user_profiles')
            .upsert(userProfileData) // 使用upsert而不是insert
            .select('*')
            .single();
            
          if (insertError) {
            console.error('创建用户资料失败:', insertError);
            // 使用基本信息作为备选
            const basicProfile = {
              id: user.id,
              name: user.email?.split('@')[0] || '用户',
              email: user.email || '',
            };
            setUserProfile(basicProfile);
            // 缓存到sessionStorage
            sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
          } else if (newProfile) {
            // 使用新创建的资料
            const profile = {
              id: user.id,
              name: (newProfile.full_name as string) || user.email?.split('@')[0] || '用户',
              email: (newProfile.email as string) || user.email || '',
            };
            setUserProfile(profile);
            // 缓存到sessionStorage
            sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(profile));
          }
        } else {
          console.error('获取用户资料错误:', error);
          
          // 如果获取失败，使用基本用户信息
          const basicProfile = {
            id: user.id,
            name: user.email?.split('@')[0] || '用户',
            email: user.email || '',
          };
          setUserProfile(basicProfile);
          // 缓存到sessionStorage
          sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
        }
      } else if (data) {
        // 成功获取资料
        const profile = {
          id: user.id,
          name: (data.full_name as string) || user.email?.split('@')[0] || '用户',
          email: (data.email as string) || user.email || '',
        };
        setUserProfile(profile);
        // 缓存到sessionStorage
        sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(profile));
      }
      
      // 标记已获取用户资料
      setProfileFetched(true);
    } catch (error) {
      console.error('处理用户资料时出错:', error);
      
      // 出现异常时，使用基本用户信息
      if (user) {
        const basicProfile = {
          id: user.id,
          name: user.email?.split('@')[0] || '用户',
          email: user.email || '',
        };
        setUserProfile(basicProfile);
        // 缓存到sessionStorage
        sessionStorage.setItem(`user_profile_${user.id}`, JSON.stringify(basicProfile));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSignOut = async () => {
    await signOut();
  };

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
        } w-64 bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out md:relative md:translate-x-0 z-40 overflow-y-auto`}
      >
        <div className="flex flex-col h-full">
          {/* 侧边栏头部 */}
          <div className="px-4 py-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    D
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">DayCraft</p>
                  <p className="text-xs text-gray-500">日报助手</p>
                </div>
              </div>
              {/* 移动端关闭按钮 */}
              <button 
                onClick={toggleSidebar} 
                className="p-1 rounded-md text-gray-500 md:hidden"
                aria-label="关闭菜单"
              >
                <XIcon size={20} />
              </button>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="px-2 py-4">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                      pathname === item.href
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                    onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="ml-3">{item.name}</span>
                  </Link>
                  {item.subItems && item.subItems.length > 0 && (
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
                            onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
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
            <div className="flex items-center">
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
            <button
              onClick={handleSignOut}
              className="mt-4 flex items-center text-gray-500 hover:text-gray-700 w-full"
            >
              <LogOutIcon className="h-5 w-5" />
              <span className="ml-2 text-sm">退出</span>
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