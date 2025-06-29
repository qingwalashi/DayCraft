"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient, UserAISettings, UserDingTalkSettings } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, TestTube, PlusCircle, Settings, Bell, Link, Smartphone, ShieldCheck, UserCog } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSystemAIConfig } from "@/lib/utils/ai-env";

interface ModelOption {
  value: string;
  label: string;
  provider?: string;
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
      </Tabs>
    </div>
  );
} 