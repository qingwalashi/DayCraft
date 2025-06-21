import * as z from "zod";

// 登录表单验证
export const loginSchema = z.object({
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
  password: z.string().min(8, { message: "密码至少需要8个字符" }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// 注册表单验证
export const signupSchema = z.object({
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
  password: z
    .string()
    .min(8, { message: "密码至少需要8个字符" })
    .regex(/[A-Z]/, { message: "密码必须包含至少一个大写字母" })
    .regex(/[0-9]/, { message: "密码必须包含至少一个数字" }),
  confirmPassword: z.string(),
  tenantName: z
    .string()
    .min(2, { message: "团队名称至少需要2个字符" })
    .max(50, { message: "团队名称不能超过50个字符" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不匹配",
  path: ["confirmPassword"],
});

export type SignupFormValues = z.infer<typeof signupSchema>;

// 忘记密码表单验证
export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// 重置密码表单验证
export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, { message: "密码至少需要8个字符" })
    .regex(/[A-Z]/, { message: "密码必须包含至少一个大写字母" })
    .regex(/[0-9]/, { message: "密码必须包含至少一个数字" }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不匹配",
  path: ["confirmPassword"],
});

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>; 