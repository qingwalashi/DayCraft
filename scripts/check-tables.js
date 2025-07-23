require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 从环境变量获取Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('缺少Supabase环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTables() {
  try {
    console.log('检查数据库表结构...');

    // 直接尝试查询work_breakdown_shares表
    const { data: shares, error: sharesError } = await supabase
      .from('work_breakdown_shares')
      .select('id, user_id, created_at')
      .limit(1);

    if (sharesError) {
      if (sharesError.code === '42P01') {
        console.log('❌ work_breakdown_shares表不存在');
        console.log('错误信息:', sharesError.message);
        console.log('需要运行迁移脚本: sql/work_breakdown_shares_migration.sql');
      } else {
        console.error('查询work_breakdown_shares表失败:', sharesError);
      }
    } else {
      console.log('✅ work_breakdown_shares表存在');
      console.log(`分享记录数量: ${shares?.length || 0}`);
      if (shares && shares.length > 0) {
        console.log('最近的分享记录:');
        shares.forEach(share => {
          console.log(`  ID: ${share.id}, User ID: ${share.user_id}, 创建时间: ${share.created_at}`);
        });
      }
    }

    // 检查user_profiles表
    console.log('\n检查user_profiles表...');
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .limit(5);

    if (profilesError) {
      if (profilesError.code === '42P01') {
        console.log('❌ user_profiles表不存在');
        console.log('错误信息:', profilesError.message);
      } else {
        console.error('查询用户资料失败:', profilesError);
      }
    } else {
      console.log('✅ user_profiles表存在');
      console.log(`用户资料数量: ${profiles?.length || 0}`);
      if (profiles && profiles.length > 0) {
        console.log('用户资料示例:');
        profiles.forEach(profile => {
          console.log(`  ID: ${profile.id}, Email: ${profile.email}, Name: ${profile.full_name || '未设置'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('检查表结构时发生错误:', error);
  }
}

checkTables();
