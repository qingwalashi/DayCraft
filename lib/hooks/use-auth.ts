import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTenantStore } from '@/lib/store/tenant-store'
import { Tenant } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/utils/env'

// 创建一个共享的 Supabase 客户端实例
const supabase = createClient();

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { setCurrentTenant } = useTenantStore()
  const [tenantFetched, setTenantFetched] = useState(false)
  const authInProgress = useRef(false);

  const fetchTenantInfo = useCallback(async (userId: string) => {
    if (typeof window !== 'undefined') {
      const cachedTenant = sessionStorage.getItem(`tenant_info_${userId}`)
      if (cachedTenant) {
        try {
          const tenant = JSON.parse(cachedTenant)
          setCurrentTenant(tenant)
          setTenantFetched(true)
          return
        } catch (e) {
          console.error('解析缓存的租户信息失败:', e)
        }
      }
    }

    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('tenant_id, tenants:tenant_id(*)')
        .eq('id', userId)
        .single()
      
      if (data && data.tenants) {
        const tenant = data.tenants as unknown as Tenant
        setCurrentTenant(tenant)
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`tenant_info_${userId}`, JSON.stringify(tenant))
        }
      }
      
      setTenantFetched(true)
    } catch (error) {
      console.error('获取租户信息失败:', error);
      // 即使失败也设置为已获取，避免无限重试
      setTenantFetched(true);
    }
  }, [setCurrentTenant])

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user || null)
        
        if (user && !tenantFetched) {
          await fetchTenantInfo(user.id)
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      } finally {
        setLoading(false)
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null)
        
        if (session?.user && !tenantFetched) {
          await fetchTenantInfo(session.user.id)
        }
        
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchTenantInfo, tenantFetched])

  const login = useCallback(async (email: string, password: string) => {
    if (authInProgress.current) {
      toast.error('登录操作正在进行中，请稍候');
      return false;
    }
    
    try {
      authInProgress.current = true;
      setLoading(true)
      
      const redirectUrl = getAuthCallbackUrl();
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error('登录失败', {
          description: error.message
        });
        return false
      }
      
      router.push('/dashboard/overview')
      return true
    } catch (error: any) {
      toast.error('登录失败', {
        description: error.message
      });
      return false
    } finally {
      setLoading(false)
      // 延迟重置状态，避免快速重复点击
      setTimeout(() => {
        authInProgress.current = false;
      }, 1000);
    }
  }, [router])

  const signup = useCallback(async (email: string, password: string, tenantName: string) => {
    if (authInProgress.current) {
      toast.error('注册操作正在进行中，请稍候');
      return false;
    }
    
    try {
      authInProgress.current = true;
      setLoading(true)
      
      const redirectUrl = getAuthCallbackUrl();
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      })

      if (authError) {
        toast.error('注册失败', {
          description: authError.message
        });
        return false
      }

      if (authData.user) {
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .insert([{ name: tenantName }])
          .select()
        
        if (tenantError) {
          toast.error('创建租户失败', {
            description: tenantError.message
          });
          return false
        }
        
        const tenant = tenantData[0] as Tenant;
        await supabase
          .from('user_profiles')
          .insert([{
            id: authData.user.id,
            email: authData.user.email,
            full_name: email.split('@')[0],
            tenant_id: tenant.id,
            role: 'admin'
          }])
        
        setCurrentTenant(tenant)
        
        toast.success('注册成功', {
          description: '请登录您的账户'
        });
        
        router.push('/login')
        return true
      }
      
    } catch (error: any) {
      toast.error('注册失败', {
        description: error.message
      });
      return false
    } finally {
      setLoading(false)
      // 延迟重置状态，避免快速重复点击
      setTimeout(() => {
        authInProgress.current = false;
      }, 1000);
    }
  }, [router, setCurrentTenant])

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
      setCurrentTenant(null)
      setTenantFetched(false)
      
      if (user && typeof window !== 'undefined') {
        sessionStorage.removeItem(`tenant_info_${user.id}`)
        sessionStorage.removeItem(`user_profile_${user.id}`)
      }
      
      router.push('/')
    } catch (error) {
      console.error('登出失败:', error);
      toast.error('登出失败，请重试');
    }
  }, [router, setCurrentTenant, user])

  return { user, loading, login, signup, logout }
} 