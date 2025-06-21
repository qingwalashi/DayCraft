import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/use-toast'
import { useTenantStore } from '@/lib/store/tenant-store'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { setCurrentTenant } = useTenantStore()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user || null)
      setLoading(false)
    }
    
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user || null)
        setLoading(false)
        
        // 当用户登录时获取其租户信息
        if (session?.user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('tenant_id, tenants:tenant_id(*)')
            .eq('id', session.user.id)
            .single()
          
          if (data?.tenants) {
            setCurrentTenant(data.tenants)
          }
        } else {
          setCurrentTenant(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [setCurrentTenant])

  const login = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast({
          title: '登录失败',
          description: error.message,
          variant: 'destructive'
        })
        return false
      }
      
      router.push('/dashboard/overview')
      return true
    } catch (error: any) {
      toast({
        title: '登录失败',
        description: error.message,
        variant: 'destructive'
      })
      return false
    } finally {
      setLoading(false)
    }
  }, [router])

  const signup = useCallback(async (email: string, password: string, tenantName: string) => {
    try {
      setLoading(true)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) {
        toast({
          title: '注册失败',
          description: authError.message,
          variant: 'destructive'
        })
        return false
      }

      if (authData.user) {
        // 创建租户
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .insert([{ name: tenantName }])
          .select()
        
        if (tenantError) {
          toast({
            title: '创建租户失败',
            description: tenantError.message,
            variant: 'destructive'
          })
          return false
        }
        
        // 创建用户资料
        const tenant = tenantData[0]
        await supabase
          .from('user_profiles')
          .insert([{
            id: authData.user.id,
            email: authData.user.email,
            full_name: email.split('@')[0],
            tenant_id: tenant.id,
            role: 'admin'
          }])
        
        // 设置当前租户
        setCurrentTenant(tenant)
        
        toast({
          title: '注册成功',
          description: '请登录您的账户',
        })
        
        router.push('/login')
        return true
      }
      
    } catch (error: any) {
      toast({
        title: '注册失败',
        description: error.message,
        variant: 'destructive'
      })
      return false
    } finally {
      setLoading(false)
    }
  }, [router, setCurrentTenant])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setCurrentTenant(null)
    router.push('/')
  }, [router, setCurrentTenant])

  return {
    user,
    loading,
    login,
    logout,
    signup,
    isAuthenticated: !!user
  }
} 