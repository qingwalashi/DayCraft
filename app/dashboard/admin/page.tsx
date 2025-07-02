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
  last_active: string | null;
  is_active: boolean;
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
    dau: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // 1. 获取所有用户
    const { data: userList, error: userError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, created_at, updated_at, last_sign_in_at");
    if (userError) {
      setLoading(false);
      return;
    }
    // 2. 获取项目、日报、AI调用等统计
    const userIds = userList.map((u: any) => u.id);
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
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    // 统计
    let active = 0, mau = 0, dau = 0;
    const userRows: UserRow[] = userList.map((u: any) => {
      const project_count = projects?.filter(p => p.user_id === u.id).length || 0;
      const dailyUserReports = dailies?.filter(d => d.user_id === u.id) || [];
      const daily_count = dailyUserReports.length;
      // AI调用
      const ai = aiSettings?.find(a => a.user_id === u.id);
      const system_ai_calls = typeof ai?.system_ai_calls === 'number' ? ai.system_ai_calls : 0;
      const custom_ai_calls = typeof ai?.custom_ai_calls === 'number' ? ai.custom_ai_calls : 0;
      // last_sign_in_at判断
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      if (lastSignIn) active++;
      if (lastSignIn && lastSignIn >= monthAgo) mau++;
      if (lastSignIn && lastSignIn.toDateString() === yesterday.toDateString()) dau++;
      return {
        id: u.id,
        full_name: u.full_name || u.email?.split("@")?.[0] || "用户",
        email: u.email,
        project_count,
        daily_count,
        system_ai_calls,
        custom_ai_calls,
        last_active: lastSignIn ? lastSignIn.toLocaleString() : null,
        is_active: !!lastSignIn
      };
    });
    setStats({
      total: userList.length,
      active,
      mau,
      dau
    });
    setUsers(userRows);
    setLoading(false);
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
            <div className="text-xs text-gray-500">激活用户</div>
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
            <div className="text-xs text-gray-500">昨日活跃</div>
            <div className="text-xl font-bold">{stats.dau}</div>
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
              <th className="px-4 py-2 text-center font-semibold text-gray-600 w-36">最近活跃</th>
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
                  <td className="px-4 py-2 text-center">{u.last_active || '-'}</td>
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