"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Loader2, SearchIcon, UsersIcon, UserCheckIcon, UserPlusIcon, UserCogIcon } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  project_count: number;
  daily_count: number;
  system_ai_calls: number;
  custom_ai_calls: number;
  last_report_edit: string | null; // 修改为最近日报编辑时间
  is_active: boolean;
}

// 定义数据类型
interface UserProfile {
  id: string;
  full_name?: string;
  email: string;
  last_report_edit_at?: string;
}

interface Project {
  id: string;
  user_id: string;
}

interface DailyReport {
  id: string;
  user_id: string;
  created_at: string;
}

interface AISettings {
  user_id: string;
  system_ai_calls?: number;
  custom_ai_calls?: number;
}

interface RecentReport {
  id: string;
  user_id: string;
  updated_at: string;
}

export default function AdminPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    mau: 0,
    wau: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. 获取所有用户
      const { data: userList, error: userError } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, created_at, updated_at, last_report_edit_at"); // 修改为获取最近日报编辑时间
      if (userError) {
        console.error("获取用户列表失败:", userError);
        setLoading(false);
        return;
      }
      
      console.log("用户数据:", userList);
      
      // 2. 获取项目、日报、AI调用等统计
      // 项目数
      const { data: projects } = await supabase
        .from("projects")
        .select("id, user_id");
      // 日报数
      const { data: dailies } = await supabase
        .from("daily_reports")
        .select("id, user_id, created_at");
      // AI调用
      const { data: aiSettings } = await supabase
        .from("user_ai_settings")
        .select("user_id, system_ai_calls, custom_ai_calls, updated_at");
      // 活跃用户统计
      const now = new Date();
      const monthAgo = new Date();
      monthAgo.setDate(now.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      
      // 手动初始化触发器函数
      // 这段代码仅用于测试，实际部署时应删除
      if (userList && userList.length > 0) {
        console.log("尝试手动更新用户最近日报编辑时间...");
        const { data: recentReports, error: recentError } = await supabase
          .from("daily_reports")
          .select("id, user_id, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
          
        if (recentError) {
          console.error("获取最近日报失败:", recentError);
        } else if (recentReports && recentReports.length > 0) {
          console.log("找到最近的日报:", recentReports.length);
          
          // 按用户分组，找到每个用户最近的日报
          const userLatestReports: Record<string, string> = {};
          (recentReports as RecentReport[]).forEach((report) => {
            if (report.user_id && report.updated_at) {
              if (!userLatestReports[report.user_id] || 
                  new Date(report.updated_at) > new Date(userLatestReports[report.user_id])) {
                userLatestReports[report.user_id] = report.updated_at;
              }
            }
          });
          
          // 更新用户资料表中的最近日报编辑时间
          for (const userId in userLatestReports) {
            console.log(`更新用户 ${userId} 的最近日报编辑时间:`, userLatestReports[userId]);
            const { error: updateError } = await supabase
              .from("user_profiles")
              .update({ last_report_edit_at: userLatestReports[userId] })
              .eq("id", userId);
              
            if (updateError) {
              console.error(`更新用户 ${userId} 的最近日报编辑时间失败:`, updateError);
            }
          }
          
          // 重新获取用户数据
          const { data: refreshedUsers, error: refreshError } = await supabase
            .from("user_profiles")
            .select("id, full_name, email, created_at, updated_at, last_report_edit_at");
            
          if (refreshError) {
            console.error("刷新用户数据失败:", refreshError);
          } else {
            console.log("刷新后的用户数据:", refreshedUsers);
            // 替换原始用户列表数据
            if (refreshedUsers) {
              const typedUserList = userList as UserProfile[];
              typedUserList.length = 0;
              (refreshedUsers as UserProfile[]).forEach(user => typedUserList.push(user));
            }
          }
        }
      }
      
      // 统计
      let active = 0, mau = 0, wau = 0;
      const userRows = (userList as UserProfile[]).map((u) => {
        const project_count = (projects as Project[])?.filter(p => p.user_id === u.id).length || 0;
        const dailyUserReports = (dailies as DailyReport[])?.filter(d => d.user_id === u.id) || [];
        const daily_count = dailyUserReports.length;
        // AI调用
        const ai = (aiSettings as AISettings[])?.find(a => a.user_id === u.id);
        const system_ai_calls = typeof ai?.system_ai_calls === 'number' ? ai.system_ai_calls : 0;
        const custom_ai_calls = typeof ai?.custom_ai_calls === 'number' ? ai.custom_ai_calls : 0;
        
        // 使用last_report_edit_at判断活跃状态
        console.log(`用户 ${u.email} 的最近日报编辑时间:`, u.last_report_edit_at);
        
        let lastReportEdit = null;
        try {
          if (u.last_report_edit_at) {
            lastReportEdit = new Date(u.last_report_edit_at);
            console.log(`解析后的日期对象:`, lastReportEdit);
          }
        } catch (e) {
          console.error(`解析日期失败:`, e);
        }
        
        if (lastReportEdit) active++;
        if (lastReportEdit && lastReportEdit >= monthAgo) mau++;
        if (lastReportEdit && lastReportEdit >= sevenDaysAgo) wau++;
        
        // 尝试获取最后一次日报编辑时间
        let lastEditDate = null;
        try {
          if (u.last_report_edit_at) {
            lastEditDate = new Date(u.last_report_edit_at).toLocaleString();
          }
        } catch (e) {
          console.error(`处理日期显示失败:`, e);
          lastEditDate = '日期处理错误';
        }
        
        return {
          id: u.id,
          full_name: u.full_name || u.email?.split("@")?.[0] || "用户",
          email: u.email,
          project_count,
          daily_count,
          system_ai_calls,
          custom_ai_calls,
          last_report_edit: lastEditDate, // 使用处理后的日期
          is_active: !!lastReportEdit // 只根据最近日报编辑时间判断活跃状态
        };
      });
      
      console.log("处理后的用户数据:", userRows);
      
      setStats({
        total: userList.length,
        active,
        mau,
        wau
      });
      setUsers(userRows);
    } catch (error) {
      console.error("获取数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 排序+搜索过滤：先按日报数量降序，再按搜索
  const filteredUsers = useMemo(() => {
    let sorted = [...users].sort((a, b) => b.daily_count - a.daily_count);
    if (!search) return sorted;
    return sorted.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()));
  }, [users, search]);

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <UserCogIcon className="w-6 h-6 text-blue-600" /> 系统管理
      </h1>
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
          <UsersIcon className="w-7 h-7 text-blue-500" />
          <div>
            <div className="text-xs text-gray-500">用户总数</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
          <UserCheckIcon className="w-7 h-7 text-green-500" />
          <div>
            <div className="text-xs text-gray-500">活跃用户</div>
            <div className="text-xl font-bold">{stats.active}</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
          <UserPlusIcon className="w-7 h-7 text-purple-500" />
          <div>
            <div className="text-xs text-gray-500">月活用户</div>
            <div className="text-xl font-bold">{stats.mau}</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
          <UserCogIcon className="w-7 h-7 text-orange-500" />
          <div>
            <div className="text-xs text-gray-500">7日活跃</div>
            <div className="text-xl font-bold">{stats.wau}</div>
          </div>
        </div>
      </div>
      {/* 搜索框 */}
      <div className="flex items-center mb-4 gap-2">
        <div className="relative w-full max-w-xs">
          <Input
            placeholder="搜索用户名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
          <SearchIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
        </div>
      </div>
      {/* 用户列表 */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-600 w-32">名称</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-600 w-56">邮箱</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-20">项目数</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-20">日报数</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-24">系统AI调用</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-24">自定义AI调用</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-36">最近日报编辑</th> {/* 修改列标题 */}
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-20">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                  <div className="text-xs text-gray-400 mt-2">加载中...</div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">暂无数据</td>
              </tr>
            ) : (
              filteredUsers.map((u, idx) => (
                <tr key={u.id} className={idx % 2 === 0 ? "bg-white hover:bg-blue-50" : "bg-gray-50 hover:bg-blue-50"}>
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {u.email}
                  </td>
                  <td className="px-4 py-2 text-center">{u.project_count}</td>
                  <td className="px-4 py-2 text-center font-bold text-blue-700">{u.daily_count}</td>
                  <td className="px-4 py-2 text-center">{u.system_ai_calls}</td>
                  <td className="px-4 py-2 text-center">{u.custom_ai_calls}</td>
                  <td className="px-4 py-2 text-center">{u.last_report_edit || '-'}</td> {/* 显示最近日报编辑时间 */}
                  <td className="px-4 py-2 text-center">
                    {u.is_active ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">活跃</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-200 text-gray-500 text-xs">未活跃</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
