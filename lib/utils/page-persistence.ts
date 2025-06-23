/**
 * 页面状态持久化工具
 * 用于处理页面在Tab切换、浏览器最小化后恢复显示时的状态保持
 */

import { useState, useEffect } from 'react';

/**
 * 使用会话存储保存页面状态
 * @param key 存储键名
 * @param data 需要保存的数据
 */
export function savePageState<T>(key: string, data: T): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`page_state_${key}`, JSON.stringify(data));
    } catch (error) {
      console.error('保存页面状态失败:', error);
    }
  }
}

/**
 * 从会话存储恢复页面状态
 * @param key 存储键名
 * @returns 恢复的数据，如果没有则返回null
 */
export function loadPageState<T>(key: string): T | null {
  if (typeof window !== 'undefined') {
    try {
      const storedData = sessionStorage.getItem(`page_state_${key}`);
      return storedData ? JSON.parse(storedData) : null;
    } catch (error) {
      console.error('加载页面状态失败:', error);
      return null;
    }
  }
  return null;
}

/**
 * 删除保存的页面状态
 * @param key 存储键名
 */
export function clearPageState(key: string): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(`page_state_${key}`);
    } catch (error) {
      console.error('清除页面状态失败:', error);
    }
  }
}

/**
 * React Hook，用于管理页面状态的持久化
 * @param key 唯一标识符
 * @param initialState 初始状态
 * @returns [状态, 设置状态的函数]
 */
export function usePersistentState<T>(key: string, initialState: T): [T, (value: T | ((prevState: T) => T)) => void] {
  // 尝试从sessionStorage加载状态，如果没有则使用初始状态
  const [state, setState] = useState<T>(() => {
    const persistedState = loadPageState<T>(key);
    return persistedState !== null ? persistedState : initialState;
  });

  // 当状态变化时保存到sessionStorage
  useEffect(() => {
    savePageState(key, state);
  }, [key, state]);

  // 添加页面可见性变化监听
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // 页面重新变为可见时，检查sessionStorage中是否有更新的状态
          const latestState = loadPageState<T>(key);
          if (latestState !== null) {
            setState(latestState);
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [key]);

  return [state, setState];
} 