import * as z from "zod";

// 项目表单验证
export const projectSchema = z.object({
  name: z.string().min(1, { message: "项目名称不能为空" }).max(100, { message: "项目名称不能超过100个字符" }),
  code: z.string().min(1, { message: "项目编号不能为空" }).max(20, { message: "项目编号不能超过20个字符" }),
  description: z.string().max(500, { message: "项目描述不能超过500个字符" }).optional(),
  is_active: z.boolean().default(true),
});

export type ProjectFormValues = z.infer<typeof projectSchema>; 