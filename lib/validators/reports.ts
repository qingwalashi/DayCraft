import * as z from "zod";

// 日报条目验证
export const reportItemSchema = z.object({
  project_id: z.string().min(1, { message: "请选择项目" }),
  content: z.string().min(1, { message: "工作内容不能为空" }).max(500, { message: "工作内容不能超过500个字符" }),
  time_spent: z.number().min(15, { message: "时间至少需要15分钟" }).max(24 * 60, { message: "时间不能超过24小时" }),
});

export type ReportItemFormValues = z.infer<typeof reportItemSchema>;

// 日报表单验证
export const dailyReportSchema = z.object({
  date: z.string(),
  items: z.array(reportItemSchema).min(1, { message: "至少需要一条工作记录" }),
});

export type DailyReportFormValues = z.infer<typeof dailyReportSchema>;

// 报表生成验证
export const reportGenerationSchema = z.object({
  report_type: z.enum(["week", "month", "custom"]),
  start_date: z.string(),
  end_date: z.string(),
  project_id: z.string().optional(),
});

export type ReportGenerationFormValues = z.infer<typeof reportGenerationSchema>; 