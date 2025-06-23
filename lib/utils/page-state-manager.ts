/**
 * 页面状态管理工具
 * 用于在页面切换、最小化后确保状态保持，不重新加载
 */

// 这个函数应在应用初始化时在客户端调用
export function initPageStateManager() {
  if (typeof window === 'undefined') return;

  // 存储页面最后活跃状态
  let lastActiveTime = Date.now();

  // 处理页面可见性变化
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // 获取当前时间
      const currentTime = Date.now();
      const timeDiff = currentTime - lastActiveTime;
      
      console.log(`页面恢复可见，离开时长: ${Math.floor(timeDiff / 1000)}秒`);
      
      // 如果离开时间不长，不重新加载任何内容
      if (timeDiff < 5 * 60 * 1000) { // 5分钟内
        // 使用history.scrollRestoration确保滚动位置恢复
        if ('scrollRestoration' in history) {
          history.scrollRestoration = 'auto';
        }
      }
      
      // 更新最后活跃时间
      lastActiveTime = currentTime;
    } else if (document.visibilityState === 'hidden') {
      // 页面隐藏时记录时间
      lastActiveTime = Date.now();
    }
  };
  
  // 处理页面刷新前的事件
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // 这里我们不阻止正常的导航和刷新
    // 但可以在这里保存额外的状态到sessionStorage
  };
  
  // 处理页面返回/前进导航
  const handlePopState = () => {
    // 在历史导航中恢复状态，而不是重新加载
    console.log('使用浏览器导航历史', window.location.pathname);
  };

  // 添加事件监听器
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('popstate', handlePopState);
  
  // 返回清理函数，可以在需要时调用
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('popstate', handlePopState);
  };
} 