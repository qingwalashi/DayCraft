import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function WorkBreakdownGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-gray-500 hover:text-gray-700 transition-colors"
        title="查看导入导出指南"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">工作分解导入导出指南</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-6 text-gray-700">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <p className="text-sm text-blue-700">
                  <strong>Excel 特点：</strong> 以表格形式展示和编辑工作项，支持五个字段：工作项名称、工作描述、工作进展、工作标签和参与人员，适合批量编辑和数据管理。
                </p>
              </div>
              
              {/* Excel导出功能 */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Excel 导出功能</h3>
                <p className="mb-2">
                  您可以将当前项目的工作分解导出为 Excel 格式，方便在表格软件中查看和编辑。
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>在工作分解页面，确保已选择需要导出的项目</li>
                  <li>点击顶部的「导出Excel」按钮</li>
                  <li>浏览器将自动下载一个 .xlsx 文件</li>
                  <li>使用 Excel、WPS 等表格软件打开该文件即可查看和编辑</li>
                </ol>
              </section>
              
              {/* Excel导入功能 */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Excel 导入功能</h3>
                <p className="mb-2">
                  您可以将符合格式的 Excel 文件导入到当前项目的工作分解中。
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>首先点击「下载模板」按钮获取标准导入模板</li>
                  <li>按照模板格式填写您的工作分解项</li>
                  <li>确保已选择需要导入到的项目</li>
                  <li>点击顶部的「导入Excel」按钮</li>
                  <li>选择您编辑好的 Excel 文件</li>
                  <li>系统会自动解析文件并将内容导入到当前项目中</li>
                </ol>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mt-4">
                  <p className="text-sm text-blue-700">
                    <strong>提示：</strong> Excel 模板包含两个工作表：第一个是示例数据，第二个是使用说明。请按照模板格式填写数据，确保层级关系正确。
                  </p>
                </div>
              </section>
              
              {/* Excel格式说明 */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Excel 格式说明</h3>
                <p>
                  Excel 导入导出支持以下字段：
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2 mt-2">
                  <li>层级 - 工作项的层级，从1开始，最大支持5级</li>
                  <li>工作项名称 - 工作项的标题（必填）</li>
                  <li>工作描述 - 工作项的详细描述（选填）</li>
                  <li>工作进展 - 状态，可选值："未开始"、"进行中"、"已暂停"、"已完成"（选填）</li>
                  <li>工作标签 - 标签列表，用逗号或顿号分隔（选填）</li>
                  <li>参与人员 - 人员列表，用逗号或顿号分隔（选填）</li>
                </ul>
              </section>
            </div>

            {/* 导入注意事项 */}
            <section className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-semibold mb-2">导入注意事项</h3>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <p className="text-sm text-yellow-700">
                  <strong>注意：</strong> 导入操作会将文件中的内容添加到当前项目中，而不会覆盖已有的工作项。
                  如果您希望完全替换现有的工作分解，建议先删除所有现有的工作项，再进行导入。
                </p>
              </div>
            </section>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 