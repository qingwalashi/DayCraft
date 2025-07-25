import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-gray-900">
      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/70 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600">DayCraft</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-blue-600 px-3 py-2 text-sm font-medium">
                登录
              </Link>
              <Link 
                href="/signup" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                免费注册
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容区域 - 占据剩余空间 */}
      <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-16 pb-6">
        <div className="max-w-6xl w-full mx-auto">
          <div className="flex flex-col lg:flex-row items-center">
            <div className="lg:w-1/2 lg:pr-12 w-full">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                <span className="text-blue-600">DayCraft</span>
                <span className="block mt-2">专业工作管理平台</span>
              </h1>
              <p className="mt-4 text-lg sm:text-xl text-gray-600 leading-relaxed">
                集项目管理、日报撰写、进度跟踪于一体的现代化工作平台。
                通过结构化的工作分解和智能化的报告生成，让您的工作更有条理，汇报更加专业。
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link 
                  href="/signup" 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-base font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  立即开始
                </Link>
                <Link 
                  href="/login" 
                  className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 px-8 py-3 rounded-lg text-base font-medium transition-colors duration-200"
                >
                  登录账号
                </Link>
              </div>
              
              {/* 功能亮点介绍 */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="ml-2 text-sm text-gray-600">项目管理</p>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="ml-2 text-sm text-gray-600">智能日报</p>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="ml-2 text-sm text-gray-600">自动周报</p>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="ml-2 text-sm text-gray-600">进度跟踪</p>
                </div>
              </div>
            </div>
            {/* 效果图片 - 仅在大屏幕显示 */}
            <div className="lg:w-1/2 mt-8 lg:mt-0 hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-lg blur-lg opacity-30 animate-pulse"></div>
                <div className="relative bg-white p-6 rounded-lg shadow-xl">
                  <div className="aspect-video bg-gray-100 rounded-md overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100 p-4">
                      <div className="h-6 bg-white rounded-md w-1/3 mb-4"></div>
                      <div className="h-4 bg-white rounded-md w-2/3 mb-2"></div>
                      <div className="h-4 bg-white rounded-md w-1/2 mb-2"></div>
                      <div className="h-4 bg-white rounded-md w-3/4 mb-6"></div>
                      
                      <div className="flex space-x-2 mb-4">
                        <div className="h-8 w-8 bg-blue-200 rounded-md"></div>
                        <div className="h-8 w-8 bg-green-200 rounded-md"></div>
                        <div className="h-8 w-8 bg-yellow-200 rounded-md"></div>
                      </div>
                      
                      <div className="h-24 bg-white bg-opacity-50 rounded-md mb-4"></div>
                      <div className="h-24 bg-white bg-opacity-50 rounded-md"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 简化页脚 - 只保留版权信息并居中 */}
      <footer className="py-4 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto text-center">
          <div className="text-sm text-blue-100">
            © 2025 DayCraft - 专业工作管理平台
          </div>
        </div>
      </footer>
    </main>
  );
} 