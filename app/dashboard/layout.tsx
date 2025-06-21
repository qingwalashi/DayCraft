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
    href: "/dashboard/reports", 
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    // 只有在认证状态确定后再检查用户是否已登录
    if (!authLoading) {
      if (!user) {
        console.log('未检测到已登录用户，重定向到登录页');
        router.replace('/login');
        return;
      }
      
      // 用户已登录，获取用户资料
      fetchUserProfile();
    }
  }, [user, authLoading]);

  // 从 Supabase 获取用户资料信息
  const fetchUserProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      // 尝试获取用户资料
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
            setUserProfile({
              id: user.id,
              name: user.email?.split('@')[0] || '用户',
              email: user.email || '',
            });
          } else if (newProfile) {
            // 使用新创建的资料
            setUserProfile({
              id: user.id,
              name: newProfile.full_name || user.email?.split('@')[0] || '用户',
              email: newProfile.email || user.email || '',
            });
          }
        } else {
          console.error('获取用户资料错误:', error);
          
          // 如果获取失败，使用基本用户信息
          setUserProfile({
            id: user.id,
            name: user.email?.split('@')[0] || '用户',
            email: user.email || '',
          });
        }
      } else if (data) {
        // 成功获取资料
        setUserProfile({
          id: user.id,
          name: data.full_name || user.email?.split('@')[0] || '用户',
          email: data.email || user.email || '',
        });
      }
    } catch (error) {
      console.error('处理用户资料时出错:', error);
      
      // 出现异常时，使用基本用户信息
      if (user) {
        setUserProfile({
          id: user.id,
          name: user.email?.split('@')[0] || '用户',
          email: user.email || '',
        });
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
      {/* 移动端侧边栏切换按钮 */}
      <button
        onClick={toggleSidebar}
        className="fixed z-50 bottom-4 right-4 p-2 rounded-full bg-blue-600 text-white shadow-lg md:hidden"
      >
        {isSidebarOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
      </button>

      {/* 侧边栏 */}
      <div
        className={`fixed inset-y-0 left-0 transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } w-64 bg-white border-r border-gray-200 transition duration-200 ease-in-out md:relative md:translate-x-0 z-30`}
      >
        <div className="flex flex-col h-full">
          {/* 侧边栏头部 */}
          <div className="px-4 py-6 border-b border-gray-200">
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
              className="mt-4 flex items-center text-gray-500 hover:text-gray-700"
            >
              <LogOutIcon className="h-5 w-5" />
              <span className="ml-2 text-sm">退出</span>
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-medium text-gray-900">
                {navigation.find((item) => item.href === pathname)?.name || "仪表盘"}
              </h1>
              <div className="flex items-center">
                <span className="text-sm text-gray-500">
                  {userProfile?.name || "用户"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
} 