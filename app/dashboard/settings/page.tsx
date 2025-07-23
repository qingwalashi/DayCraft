"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, UserAISettings, UserDingTalkSettings } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, TestTube, PlusCircle, Settings, Bell, Link, Smartphone, ShieldCheck, UserCog, Share, Trash2, Edit, Copy, Calendar, Lock, Play, Pause } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSystemAIConfig } from "../../../lib/utils/ai-env";

interface ModelOption {
  value: string;
  label: string;
  provider?: string;
}

interface Project {
  id: string;
  name: string;
  code: string | null;
}

interface ShareItem {
  id: string;
  share_token: string;
  share_url: string;
  // 向后兼容字段
  project_id: string;
  project_name: string;
  project_code: string;
  // 新增多项目字段
  projects: Project[];
  project_count: number;
  has_password: boolean;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelName, setCustomModelName] = useState("");
  const [activeTab, setActiveTab] = useState("ai");
  const [isDingTalkSaving, setIsDingTalkSaving] = useState(false);
  const [aiType, setAiType] = useState<'system' | 'custom'>('custom');
  
  // 表单状态
  const [settings, setSettings] = useState<UserAISettings | null>(null);
  const [dingTalkSettings, setDingTalkSettings] = useState<UserDingTalkSettings | null>(null);
  const [formData, setFormData] = useState({
    api_url: "https://api.openai.com/v1",
    api_key: "",
    model_name: "gpt-3.5-turbo",
    system_prompt: "你是一个专业的工作报告助手，负责帮助用户整理和生成日报、周报和月报。",
    user_prompt: "请根据我的工作内容，生成一份专业的{report_type}。以下是我的工作记录：\n\n{report_content}",
    is_enabled: true
  });
  const [dingTalkFormData, setDingTalkFormData] = useState({
    is_enabled: false,
    ios_url_scheme: "dingtalk://dingtalkclient/page/link?url=",
  });

  // 共享设置状态
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesLoaded, setSharesLoaded] = useState(false); // 标记是否已加载过

  // 模型选项
  const modelOptions: ModelOption[] = [
    // OpenAI 模型
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", provider: "OpenAI" },
    { value: "gpt-4", label: "GPT-4", provider: "OpenAI" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", provider: "OpenAI" },
    { value: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
    
    // DeepSeek 模型
    { value: "deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek" },
    { value: "deepseek-coder", label: "DeepSeek Coder", provider: "DeepSeek" },
    { value: "deepseek-llm-67b-chat", label: "DeepSeek LLM 67B Chat", provider: "DeepSeek" },
    { value: "deepseek-math", label: "DeepSeek Math", provider: "DeepSeek" },
    
    // Claude 模型
    { value: "claude-3-opus", label: "Claude 3 Opus", provider: "Anthropic" },
    { value: "claude-3-sonnet", label: "Claude 3 Sonnet", provider: "Anthropic" },
    { value: "claude-3-haiku", label: "Claude 3 Haiku", provider: "Anthropic" },
    
    // 自定义模型选项
    { value: "custom", label: "自定义模型..." }
  ];

  // 加载用户AI设置
  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      
      try {
        const supabase = createClient();
        const [aiResult, dingTalkResult] = await Promise.all([
          supabase
            .from("user_ai_settings")
            .select("*")
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("user_dingtalk_settings")
            .select("*")
            .eq("user_id", user.id)
            .single()
        ]);
          
        if (aiResult.error) {
          console.error("加载AI设置失败:", aiResult.error);
        }
        
        if (dingTalkResult.error && dingTalkResult.error.code !== 'PGRST116') {
          // PGRST116是未找到记录的错误，这种情况可以忽略
          console.error("加载钉钉设置失败:", dingTalkResult.error);
        }
        
        if (aiResult.data) {
          const userSettings = aiResult.data as UserAISettings;
          setSettings(userSettings);
          setAiType(userSettings.settings_type === 'system' ? 'system' : 'custom');
          
          // 检查是否是自定义模型
          const isCustom = !modelOptions.some(option => 
            option.value === userSettings.model_name && option.value !== "custom"
          );
          setIsCustomModel(isCustom);
          
          if (isCustom) {
            setCustomModelName(userSettings.model_name || "");
          }
          
          setFormData({
            api_url: userSettings.api_url || "https://api.openai.com/v1",
            api_key: userSettings.api_key || "",
            model_name: isCustom ? "custom" : (userSettings.model_name || "gpt-3.5-turbo"),
            system_prompt: userSettings.system_prompt || "你是一个专业的工作报告助手，负责帮助用户整理和生成日报、周报和月报。",
            user_prompt: userSettings.user_prompt || "请根据我的工作内容，生成一份专业的{report_type}。以下是我的工作记录：\n\n{report_content}",
            is_enabled: userSettings.is_enabled !== undefined ? userSettings.is_enabled : true
          });
        }
        
        if (dingTalkResult.data) {
          const userDingTalkSettings = dingTalkResult.data as UserDingTalkSettings;
          setDingTalkSettings(userDingTalkSettings);
          setDingTalkFormData({
            is_enabled: userDingTalkSettings.is_enabled !== undefined ? userDingTalkSettings.is_enabled : false,
            ios_url_scheme: userDingTalkSettings.ios_url_scheme || "dingtalk://dingtalkclient/page/link?url=",
          });
        }
      } catch (error) {
        console.error("加载设置时出错:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadSettings();
  }, [user]);

  // 切换AI类型
  const handleAiTypeChange = async (type: 'system' | 'custom') => {
    setAiType(type);
    if (!user || !settings) return;
    const supabase = createClient();

    // 只更新settings_type，不重置调用次数
    await supabase
      .from('user_ai_settings')
      .update({ settings_type: type, updated_at: new Date().toISOString() })
      .eq('id', settings.id);

    if (type === 'system') {
      // 读取系统环境变量
      const sys = getSystemAIConfig();
      setFormData({
        api_url: sys.api_url,
        api_key: sys.api_key,
        model_name: sys.model_name,
        system_prompt: sys.system_prompt,
        user_prompt: sys.user_prompt,
        is_enabled: true
      });
      setSettings(prev => prev ? {
        ...prev,
        settings_type: type
      } : null);
    } else {
      // 恢复用户自定义
      setFormData({
        api_url: settings.api_url || '',
        api_key: settings.api_key || '',
        model_name: settings.model_name || '',
        system_prompt: settings.system_prompt || '',
        user_prompt: settings.user_prompt || '',
        is_enabled: settings.is_enabled !== undefined ? settings.is_enabled : true
      });
      setSettings(prev => prev ? {
        ...prev,
        settings_type: type
      } : null);
    }
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    
    try {
      const supabase = createClient();
      
      // 确定要保存的模型名称
      const modelNameToSave = formData.model_name === "custom" ? customModelName : formData.model_name;
      
      // 如果选择了自定义模型但没有填写名称，显示错误
      if (formData.model_name === "custom" && !customModelName.trim()) {
        toast.error("请填写自定义模型名称");
        setIsSaving(false);
        return;
      }
      
      // 如果已有设置则更新，否则创建新设置
      if (settings) {
        const { error } = await supabase
          .from("user_ai_settings")
          .update({
            api_url: formData.api_url,
            api_key: formData.api_key || settings.api_key, // 如果未提供新API key，保留原有的
            model_name: modelNameToSave,
            system_prompt: formData.system_prompt,
            user_prompt: formData.user_prompt,
            is_enabled: formData.is_enabled,
            updated_at: new Date().toISOString()
          })
          .eq("id", settings.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_ai_settings")
          .insert({
            user_id: user.id,
            api_url: formData.api_url,
            api_key: formData.api_key,
            model_name: modelNameToSave,
            system_prompt: formData.system_prompt,
            user_prompt: formData.user_prompt,
            is_enabled: formData.is_enabled
          });
          
        if (error) throw error;
      }
      
      toast.success("AI设置已保存");
    } catch (error: any) {
      console.error("保存AI设置失败:", error);
      toast.error(`保存失败: ${error.message || "未知错误"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 处理表单输入变化
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === "model_name") {
      setIsCustomModel(value === "custom");
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // 处理开关状态变化
  const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, is_enabled: checked }));
    
    // 立即保存AI开关状态到数据库
    if (user && settings) {
      const supabase = createClient();
      supabase
        .from("user_ai_settings")
        .update({
          is_enabled: checked,
          updated_at: new Date().toISOString()
        })
        .eq("id", settings.id)
        .then(({ error }) => {
          if (error) {
            console.error("更新AI开关状态失败:", error);
            toast.error(`更新失败: ${error.message || "未知错误"}`);
            // 回滚状态
            setFormData(prev => ({ ...prev, is_enabled: !checked }));
          } else {
            toast.success(checked ? "AI功能已启用" : "AI功能已禁用");
          }
        });
    }
  };
  
  // 处理自定义模型名称变化
  const handleCustomModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomModelName(e.target.value);
  };

  // 测试API连接
  const testApiConnection = async () => {
    if (!formData.api_url || !formData.api_key) {
      toast.error("请先填写API URL和API Key");
      return;
    }
    
    toast.info("正在测试API连接...");
    
    try {
      // 根据选择的模型确定提供商
      const selectedModel = modelOptions.find(option => option.value === formData.model_name);
      const provider = selectedModel?.provider || 
                      (formData.model_name === "custom" ? "Unknown" : "OpenAI");
      
      // 构建测试请求
      let response;
      
      if (provider === "OpenAI") {
        // OpenAI API测试
        response = await fetch(`${formData.api_url}/models`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${formData.api_key}`,
            "Content-Type": "application/json"
          }
        });
      } else if (provider === "Anthropic") {
        // Anthropic API测试
        response = await fetch(`${formData.api_url}/models`, {
          method: "GET",
          headers: {
            "x-api-key": formData.api_key,
            "Content-Type": "application/json"
          }
        });
      } else if (provider === "DeepSeek") {
        // DeepSeek API测试
        response = await fetch(`${formData.api_url}/models`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${formData.api_key}`,
            "Content-Type": "application/json"
          }
        });
      } else {
        // 通用测试方法 - 尝试获取模型列表
        response = await fetch(`${formData.api_url}/models`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${formData.api_key}`,
            "Content-Type": "application/json"
          }
        });
      }
      
      // 检查响应状态
      if (response.ok) {
        toast.success("API连接测试成功");
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API返回错误状态码: ${response.status}`);
      }
    } catch (error: any) {
      console.error("API连接测试失败:", error);
      toast.error(`API连接测试失败: ${error.message || "未知错误"}`);
    }
  };
  
  // 根据选择的模型自动设置API URL
  useEffect(() => {
    if (formData.model_name === "custom") return;
    
    const selectedModel = modelOptions.find(option => option.value === formData.model_name);
    if (selectedModel?.provider === "DeepSeek") {
      setFormData(prev => ({
        ...prev,
        api_url: "https://api.deepseek.com/v1"
      }));
    } else if (selectedModel?.provider === "Anthropic") {
      setFormData(prev => ({
        ...prev,
        api_url: "https://api.anthropic.com/v1"
      }));
    } else if (selectedModel?.provider === "OpenAI") {
      setFormData(prev => ({
        ...prev,
        api_url: "https://api.openai.com/v1"
      }));
    }
  }, [formData.model_name]);

  // 加载共享数据
  const loadShares = async (force = false) => {
    if (!user) return;

    // 如果已经加载过且不是强制刷新，则跳过
    if (sharesLoaded && !force) return;

    setSharesLoading(true);
    try {
      const response = await fetch('/api/work-breakdown/share');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取共享列表失败');
      }

      setShares(data.shares || []);
      setSharesLoaded(true);
    } catch (error: any) {
      console.error('加载共享数据失败:', error);
      toast.error(error.message || '加载共享数据失败');
    } finally {
      setSharesLoading(false);
    }
  };

  // 当切换到共享设置选项卡时加载数据（仅首次）
  useEffect(() => {
    if (activeTab === 'shares' && !sharesLoaded) {
      loadShares();
    }
  }, [activeTab, user, sharesLoaded]);

  // 删除分享
  const deleteShare = async (shareId: string) => {
    try {
      const response = await fetch(`/api/work-breakdown/share/${shareId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '删除分享失败');
      }

      toast.success('分享已删除');
      // 更新本地状态，避免重新加载
      setShares(prevShares => prevShares.filter(share => share.id !== shareId));
    } catch (error: any) {
      console.error('删除分享失败:', error);
      toast.error(error.message || '删除分享失败');
    }
  };

  // 切换分享状态
  const toggleShareStatus = async (shareId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/work-breakdown/share/${shareId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '更新分享状态失败');
      }

      toast.success(isActive ? '分享已启用' : '分享已暂停');
      // 更新本地状态，避免重新加载
      setShares(prevShares =>
        prevShares.map(share =>
          share.id === shareId
            ? { ...share, is_active: isActive, updated_at: new Date().toISOString() }
            : share
        )
      );
    } catch (error: any) {
      console.error('更新分享状态失败:', error);
      toast.error(error.message || '更新分享状态失败');
    }
  };

  // 复制链接
  const copyShareUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('链接已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
  };

  // 复制分享信息（包含项目信息）
  const copyShareInfo = async (share: ShareItem) => {
    try {
      let shareInfo = `📋 工作分解分享\n`;

      if (share.projects && share.projects.length > 1) {
        shareInfo += `项目: ${share.projects.map(p => p.name).join(', ')}\n`;
      } else if (share.projects && share.projects.length === 1) {
        shareInfo += `项目: ${share.projects[0].name}\n`;
      } else {
        shareInfo += `项目: ${share.project_name}\n`;
      }

      shareInfo += `链接: ${share.share_url}`;

      if (share.has_password) {
        shareInfo += `\n🔒 此分享需要密码访问`;
      }

      if (share.expires_at) {
        shareInfo += `\n⏰ 过期时间: ${new Date(share.expires_at).toLocaleString()}`;
      }

      await navigator.clipboard.writeText(shareInfo);
      toast.success('分享信息已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
  };



  // 处理钉钉表单提交
  const handleDingTalkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsDingTalkSaving(true);
    
    try {
      const supabase = createClient();
      
      // 如果已有设置则更新，否则创建新设置
      if (dingTalkSettings) {
        const { error } = await supabase
          .from("user_dingtalk_settings")
          .update({
            ios_url_scheme: dingTalkFormData.ios_url_scheme,
            is_enabled: dingTalkFormData.is_enabled,
            updated_at: new Date().toISOString()
          })
          .eq("id", dingTalkSettings.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_dingtalk_settings")
          .insert({
            user_id: user.id,
            ios_url_scheme: dingTalkFormData.ios_url_scheme,
            is_enabled: dingTalkFormData.is_enabled
          });
          
        if (error) throw error;
      }
      
      toast.success("钉钉设置已保存");
    } catch (error: any) {
      console.error("保存钉钉设置失败:", error);
      toast.error(`保存失败: ${error.message || "未知错误"}`);
    } finally {
      setIsDingTalkSaving(false);
    }
  };
  
  // 处理钉钉表单输入变化
  const handleDingTalkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDingTalkFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // 处理钉钉开关状态变化
  const handleDingTalkSwitchChange = (checked: boolean) => {
    setDingTalkFormData(prev => ({ ...prev, is_enabled: checked }));
    
    // 立即保存钉钉开关状态到数据库
    if (user && dingTalkSettings) {
      const supabase = createClient();
      supabase
        .from("user_dingtalk_settings")
        .update({
          is_enabled: checked,
          updated_at: new Date().toISOString()
        })
        .eq("id", dingTalkSettings.id)
        .then(({ error }) => {
          if (error) {
            console.error("更新钉钉开关状态失败:", error);
            toast.error(`更新失败: ${error.message || "未知错误"}`);
            // 回滚状态
            setDingTalkFormData(prev => ({ ...prev, is_enabled: !checked }));
          } else {
            toast.success(checked ? "钉钉功能已启用" : "钉钉功能已禁用");
          }
        });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">系统设置</h1>
      </div>
      
      <Tabs defaultValue="ai" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="ai" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            AI设置
          </TabsTrigger>
          <TabsTrigger value="dingtalk" className="flex items-center">
            <Bell className="h-4 w-4 mr-2" />
            钉钉配置
          </TabsTrigger>
          <TabsTrigger value="shares" className="flex items-center">
            <Share className="h-4 w-4 mr-2" />
            共享设置
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="ai" className="space-y-4">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">AI功能设置</h2>
              <div className="flex items-center space-x-2">
                <Label htmlFor="ai-enabled" className={formData.is_enabled ? "text-blue-600" : "text-gray-500"}>
                  {formData.is_enabled ? "已启用" : "已禁用"}
                </Label>
                <Switch 
                  id="ai-enabled" 
                  checked={formData.is_enabled} 
                  onCheckedChange={handleSwitchChange}
                />
              </div>
            </div>
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                className={`flex items-center p-4 rounded-lg border transition-all duration-200 shadow-sm space-x-4 ${aiType === 'system' ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-blue-400'}`}
                onClick={() => handleAiTypeChange('system')}
                disabled={aiType === 'system'}
              >
                <ShieldCheck className={`h-8 w-8 ${aiType === 'system' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-bold text-lg ${aiType === 'system' ? 'text-blue-700' : 'text-gray-800'}`}>系统内置AI</div>
                  <div className="text-gray-500 text-sm">由系统统一配置，安全可靠，免去个人API管理。</div>
                </div>
              </button>
              <button
                type="button"
                className={`flex items-center p-4 rounded-lg border transition-all duration-200 shadow-sm space-x-4 ${aiType === 'custom' ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-blue-400'}`}
                onClick={() => handleAiTypeChange('custom')}
                disabled={aiType === 'custom'}
              >
                <UserCog className={`h-8 w-8 ${aiType === 'custom' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-bold text-lg ${aiType === 'custom' ? 'text-blue-700' : 'text-gray-800'}`}>用户自定义AI</div>
                  <div className="text-gray-500 text-sm">可自定义API、模型和提示词，满足个性化需求。</div>
                </div>
              </button>
            </div>
            {aiType === 'custom' && (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className={!formData.is_enabled ? "opacity-50 pointer-events-none" : ""}>
                  <h2 className="text-lg font-medium text-gray-900 mb-4">API设置</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="api_url" className="block text-sm font-medium text-gray-700 mb-1">
                        API URL
                      </label>
                      <input
                        id="api_url"
                        name="api_url"
                        type="text"
                        value={formData.api_url}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="https://api.openai.com/v1"
                        disabled={!formData.is_enabled}
                      />
                    </div>
                    <div>
                      <label htmlFor="api_key" className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          id="api_key"
                          name="api_key"
                          type={showApiKey ? "text" : "password"}
                          value={formData.api_key}
                          onChange={handleChange}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder={settings?.api_key ? "••••••••" : "sk-..."}
                          disabled={!formData.is_enabled}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          disabled={!formData.is_enabled}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={testApiConnection}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-md text-sm font-medium shadow-sm hover:shadow transition-all duration-200 flex items-center"
                      disabled={!formData.is_enabled}
                    >
                      <TestTube className="h-4 w-4 mr-2" />
                      测试API连接
                    </button>
                  </div>
                </div>
                <div className={!formData.is_enabled ? "opacity-50 pointer-events-none" : ""}>
                  <h2 className="text-lg font-medium text-gray-900 mb-4">模型设置</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="model_name" className="block text-sm font-medium text-gray-700 mb-1">
                        模型选择
                      </label>
                      <select
                        id="model_name"
                        name="model_name"
                        value={formData.model_name}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        disabled={!formData.is_enabled}
                      >
                        <optgroup label="OpenAI 模型">
                          {modelOptions.filter(option => option.provider === "OpenAI").map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="DeepSeek 模型">
                          {modelOptions.filter(option => option.provider === "DeepSeek").map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Anthropic 模型">
                          {modelOptions.filter(option => option.provider === "Anthropic").map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="其他">
                          {modelOptions.filter(option => !option.provider).map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    {isCustomModel && (
                      <div>
                        <label htmlFor="custom_model" className="block text-sm font-medium text-gray-700 mb-1">
                          自定义模型名称
                        </label>
                        <div className="flex items-center">
                          <PlusCircle className="h-4 w-4 text-gray-400 mr-2" />
                          <input
                            id="custom_model"
                            type="text"
                            value={customModelName}
                            onChange={handleCustomModelChange}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="输入模型名称，例如：gemini-pro"
                            disabled={!formData.is_enabled}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          请输入模型的准确名称，确保与API提供商的模型标识符一致。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className={!formData.is_enabled ? "opacity-50 pointer-events-none" : ""}>
                  <h2 className="text-lg font-medium text-gray-900 mb-4">提示词设置</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="system_prompt" className="block text-sm font-medium text-gray-700 mb-1">
                        系统提示词
                      </label>
                      <textarea
                        id="system_prompt"
                        name="system_prompt"
                        rows={3}
                        value={formData.system_prompt}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="你是一个专业的工作报告助手..."
                        disabled={!formData.is_enabled}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        系统提示词用于设置AI助手的角色和行为方式。
                      </p>
                    </div>
                    <div>
                      <label htmlFor="user_prompt" className="block text-sm font-medium text-gray-700 mb-1">
                        用户提示词模板
                      </label>
                      <textarea
                        id="user_prompt"
                        name="user_prompt"
                        rows={5}
                        value={formData.user_prompt}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="请根据我的工作内容，生成一份专业的{report_type}..."
                        disabled={!formData.is_enabled}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        用户提示词模板用于生成报告时的指令。可以使用 {"{report_type}"} 和 {"{report_content}"} 作为占位符。
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving || !formData.is_enabled}
                    className={`px-4 py-2 ${!formData.is_enabled ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-md text-sm font-medium flex items-center`}
                  >
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    保存设置
                  </button>
                </div>
              </form>
            )}
            {aiType === 'system' && (
              <div className="p-6 bg-blue-50 rounded-lg border border-blue-100 text-blue-800 flex items-start space-x-4">
                <ShieldCheck className="h-8 w-8 flex-shrink-0 text-blue-500 mt-1" />
                <div>
                  <div className="font-bold text-lg mb-1">当前使用系统内置AI</div>
                  <div className="text-sm mb-2">所有AI参数由系统统一配置，无需个人维护。若需自定义API或模型，请切换到"用户自定义AI"。</div>
                  <div className="text-xs text-blue-700">
                    <div>API URL: <span className="font-mono">{getSystemAIConfig().api_url || '未配置'}</span></div>
                    <div>模型名称: <span className="font-mono">{getSystemAIConfig().model_name || '未配置'}</span></div>
                    <div>
                      剩余调用次数: <span className="font-mono">{settings?.system_ai_remaining_calls ?? '-'}</span>
                      /
                      <span className="font-mono">{settings?.system_ai_total_calls_limit ?? '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="dingtalk">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">钉钉集成设置</h2>
              <div className="flex items-center space-x-2">
                <Label htmlFor="dingtalk-enabled" className={dingTalkFormData.is_enabled ? "text-blue-600" : "text-gray-500"}>
                  {dingTalkFormData.is_enabled ? "已启用" : "已禁用"}
                </Label>
                <Switch 
                  id="dingtalk-enabled" 
                  checked={dingTalkFormData.is_enabled} 
                  onCheckedChange={handleDingTalkSwitchChange}
                />
              </div>
            </div>
            
            <form onSubmit={handleDingTalkSubmit} className="space-y-6">
              <div className={!dingTalkFormData.is_enabled ? "opacity-50 pointer-events-none" : ""}>
                <h2 className="text-lg font-medium text-gray-900 mb-4">iOS跳转钉钉设置</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="ios_url_scheme" className="block text-sm font-medium text-gray-700 mb-1">
                      URL Scheme
                    </label>
                    <div className="flex items-center">
                      <Link className="h-4 w-4 text-gray-400 mr-2" />
                      <input
                        id="ios_url_scheme"
                        name="ios_url_scheme"
                        type="text"
                        value={dingTalkFormData.ios_url_scheme}
                        onChange={handleDingTalkChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="dingtalk://dingtalkclient/page/link?url="
                        disabled={!dingTalkFormData.is_enabled}
                      />
                    </div>
                    <div className="mt-2 flex items-center text-sm text-amber-600">
                      <Smartphone className="h-4 w-4 mr-1" />
                      <p>此功能仅支持iOS客户端</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      配置用于从应用跳转到钉钉的URL Scheme，用于快速分享工作日志到钉钉
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isDingTalkSaving || !dingTalkFormData.is_enabled}
                  className={`px-4 py-2 ${!dingTalkFormData.is_enabled ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-md text-sm font-medium flex items-center`}
                >
                  {isDingTalkSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  保存设置
                </button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="shares" className="space-y-4">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-900">工作分解共享</h2>
                <p className="text-sm text-gray-600 mt-1">管理您的工作分解共享链接</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
                <button
                  onClick={() => window.open('/dashboard/work-breakdown', '_blank')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center text-sm"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  创建分享
                </button>
                <button
                  onClick={() => loadShares(true)}
                  disabled={sharesLoading}
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center text-sm"
                >
                  {sharesLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  刷新
                </button>
              </div>
            </div>

            {sharesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">加载中...</span>
              </div>
            ) : shares.length === 0 ? (
              <div className="text-center py-12">
                <Share className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">暂无共享</h3>
                <p className="text-gray-600">您还没有创建任何工作分解的共享链接</p>
                <p className="text-sm text-gray-500 mt-2">
                  前往 <a href="/dashboard/work-breakdown" className="text-blue-600 hover:text-blue-800">工作分解</a> 页面创建分享
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {shares.map((share) => (
                  <div key={share.id} className="border border-gray-200 rounded-lg bg-white p-4 sm:p-6 hover:shadow-sm transition-shadow">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {/* 项目标题和状态 */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              <Share className="h-5 w-5 text-gray-400 shrink-0" />
                              <h3 className="font-medium text-gray-900">
                                {share.projects && share.projects.length > 1
                                  ? `多项目分享 (${share.projects.length}个项目)`
                                  : share.project_name || share.projects?.[0]?.name || '未知项目'
                                }
                              </h3>
                            </div>

                            {/* 多项目列表 */}
                            {share.projects && share.projects.length > 1 && (
                              <div className="space-y-1 ml-7">
                                {share.projects.map((project, index) => (
                                  <div key={project.id} className="flex items-center space-x-2 text-sm">
                                    <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center shrink-0">
                                      {index + 1}
                                    </span>
                                    <span className="text-gray-700 truncate">{project.name}</span>
                                    {project.code && (
                                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                        {project.code}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* 单项目时显示项目编码 */}
                            {share.projects && share.projects.length === 1 && share.projects[0].code && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {share.projects[0].code}
                              </span>
                            )}
                            {/* 向后兼容：如果没有projects数组但有project_code */}
                            {(!share.projects || share.projects.length === 0) && share.project_code && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {share.project_code}
                              </span>
                            )}

                            <span className={`text-xs px-2 py-1 rounded font-medium ${
                              share.is_active
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {share.is_active ? '已启用' : '已暂停'}
                            </span>

                            {share.has_password && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded flex items-center">
                                <Lock className="h-3 w-3 mr-1" />
                                密码保护
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 分享信息 */}
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span>创建时间: {new Date(share.created_at).toLocaleDateString()}</span>
                          </div>

                          {share.expires_at && (
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <span>过期时间: {new Date(share.expires_at).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        {/* 分享链接 */}
                        <div className="bg-gray-50 rounded-md p-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <Link className="h-4 w-4 text-gray-500 shrink-0" />
                            <span className="text-sm font-medium text-gray-700">分享链接</span>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={share.share_url}
                              readOnly
                              className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-2 font-mono text-gray-600 min-w-0"
                            />
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => copyShareUrl(share.share_url)}
                                className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded border border-gray-200 transition-colors flex items-center justify-center"
                                title="复制链接"
                              >
                                <Copy className="h-4 w-4 sm:mr-0 mr-1" />
                                <span className="sm:hidden">复制链接</span>
                              </button>
                              <button
                                onClick={() => copyShareInfo(share)}
                                className="px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 transition-colors flex items-center justify-center"
                                title="复制分享信息"
                              >
                                <Share className="h-4 w-4 sm:mr-0 mr-1" />
                                <span className="sm:hidden">复制信息</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex flex-col lg:flex-row gap-2 lg:ml-4 shrink-0">
                        <button
                          onClick={() => window.open(share.share_url, '_blank')}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center"
                          title="预览分享"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          预览
                        </button>

                        <button
                          onClick={() => toggleShareStatus(share.id, !share.is_active)}
                          className="px-3 py-2 text-sm bg-blue-600 text-white border border-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
                          title={share.is_active ? '暂停分享' : '启用分享'}
                        >
                          {share.is_active ? (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              暂停
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              启用
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm('确定要删除这个分享吗？此操作不可恢复。')) {
                              deleteShare(share.id);
                            }
                          }}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center"
                          title="删除分享"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>


    </div>
  );
}