// 系统内置AI配置读取工具
export function getSystemAIConfig() {
  return {
    api_url: process.env.NEXT_PUBLIC_AI_API_URL || '',
    api_key: process.env.NEXT_PUBLIC_AI_API_KEY || '',
    model_name: process.env.NEXT_PUBLIC_AI_MODEL_NAME || '',
    system_prompt: process.env.NEXT_PUBLIC_AI_SYSTEM_PROMPT || '',
    user_prompt: process.env.NEXT_PUBLIC_AI_USER_PROMPT || '',
  };
} 