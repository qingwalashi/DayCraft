/**
 * 页面状态持久化工具
 * 用于处理页面在Tab切换、浏览器最小化后恢复显示时的状态保持
 */

import { useState, useEffect, useRef } from 'react';

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
  // 使用ref来跟踪是否正在从sessionStorage恢复状态，避免循环更新
  const isRestoringRef = useRef(false);
  const lastSavedValueRef = useRef<string>('');
  
  // 尝试从sessionStorage加载状态，如果没有则使用初始状态
  const [state, setState] = useState<T>(() => {
    const persistedState = loadPageState<T>(key);
    if (persistedState !== null) {
      isRestoringRef.current = true;
      lastSavedValueRef.current = JSON.stringify(persistedState);
    }
    return persistedState !== null ? persistedState : initialState;
  });

  // 当状态变化时保存到sessionStorage，但避免在恢复状态时保存
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    
    const currentValue = JSON.stringify(state);
    if (currentValue !== lastSavedValueRef.current) {
      savePageState(key, state);
      lastSavedValueRef.current = currentValue;
    }
  }, [key, state]);

  // 移除页面可见性变化监听，避免重复触发状态更新
  // 这个功能可能导致循环更新，我们改为在具体页面中根据需要处理

  return [state, setState];
} 