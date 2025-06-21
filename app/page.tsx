import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-gray-900">
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

      {/* 英雄区域 */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center">
            <div className="lg:w-1/2 lg:pr-12">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                <span className="text-blue-600">DayCraft</span> 
                <span className="block mt-2">智能日报助手</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed">
                告别繁琐的日报撰写，专注于真正的工作。
                我们的AI助手帮您整理、记录和生成专业的日报和周报，提高工作效率。
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
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
            </div>
            <div className="lg:w-1/2 mt-12 lg:mt-0">
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
      </section>

      {/* 特性介绍 */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            <span className="text-blue-600">简化</span> 您的工作汇报流程
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* 特性1 */}
            <div className="bg-blue-50 rounded-xl p-6 hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">智能日报管理</h3>
              <p className="text-gray-600">
                轻松记录每日工作内容，按项目分类整理，一键生成格式统一的日报。
              </p>
            </div>
            
            {/* 特性2 */}
            <div className="bg-blue-50 rounded-xl p-6 hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">自动周报月报</h3>
              <p className="text-gray-600">
                基于日报内容，自动生成周报和月报，节省汇总时间，提高工作效率。
              </p>
            </div>
            
            {/* 特性3 */}
            <div className="bg-blue-50 rounded-xl p-6 hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">AI辅助润色</h3>
              <p className="text-gray-600">
                内置AI助手，一键优化报告内容，使表达更加专业清晰，提升工作形象。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 统计数据 */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <div className="text-blue-200">活跃用户</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">10,000+</div>
              <div className="text-blue-200">日报生成</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">1,200+</div>
              <div className="text-blue-200">周报生成</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">98%</div>
              <div className="text-blue-200">用户满意度</div>
            </div>
          </div>
        </div>
      </section>

      {/* 用户评价 */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            用户的<span className="text-blue-600">真实评价</span>
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  L
                </div>
                <div className="ml-4">
                  <div className="font-medium">李工程师</div>
                  <div className="text-sm text-gray-500">软件开发</div>
                </div>
              </div>
              <p className="text-gray-600">
                "DayCraft让我的日报工作变得轻松许多，每天只需几分钟就能完成高质量的工作汇报，节省了大量时间。"
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  W
                </div>
                <div className="ml-4">
                  <div className="font-medium">王经理</div>
                  <div className="text-sm text-gray-500">项目管理</div>
                </div>
              </div>
              <p className="text-gray-600">
                "作为团队负责人，DayCraft帮我轻松掌握团队成员的工作进度，自动生成的周报让我的管理工作更加高效。"
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  Z
                </div>
                <div className="ml-4">
                  <div className="font-medium">张产品</div>
                  <div className="text-sm text-gray-500">产品设计</div>
                </div>
              </div>
              <p className="text-gray-600">
                "AI润色功能非常实用，能够将我简单的工作记录转化为专业的汇报内容，给领导留下了很好的印象。"
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 行动召唤 */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-blue-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            准备好提升您的工作效率了吗？
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            立即注册DayCraft，体验智能日报管理的便捷
          </p>
          <Link 
            href="/signup" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
          >
            免费开始使用
          </Link>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <div className="text-xl font-bold text-white">DayCraft</div>
              <div className="mt-1">智能日报助手</div>
            </div>
            <div className="text-sm">
              © {new Date().getFullYear()} DayCraft AI 提供技术支持
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
} 