'use client';

import { WifiOffIcon } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
            <WifiOffIcon className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
          您当前处于离线状态
        </h1>
        
        <p className="text-gray-600 mb-6">
          无法连接到网络，请检查您的网络连接后重试。部分已缓存的内容仍可使用。
        </p>
        
        <div className="space-y-3">
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors"
          >
            重新连接
          </button>
          
          <Link 
            href="/"
            className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-md transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
      
      <div className="mt-6 text-sm text-gray-500">
        DayCraft - 即使离线也能工作的日报助手
      </div>
    </div>
  );
} 