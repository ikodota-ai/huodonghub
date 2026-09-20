import { Card, Badge } from "@/components/ui";

const TOOLS = [
  {
    category: "PPT 制作",
    icon: "📊",
    tools: [
      { name: "Kimi PPT 助手", url: "https://www.kimi.com", desc: "粘贴大纲一键生成 PPT，免费额度日常够用" },
      { name: "AiPPT", url: "https://www.aippt.cn", desc: "模板丰富，支持 Word/大纲导入" },
    ],
    sop: "1. 用 LLM（DeepSeek/豆包）生成 PPT 大纲\n2. 大纲粘贴进 Kimi/AiPPT 生成初稿\n3. 套用部门模板人工精修",
  },
  {
    category: "AI 图片",
    icon: "🎨",
    tools: [
      { name: "即梦", url: "https://jimeng.jianying.com", desc: "字节出品，海报/主视觉出图快" },
      { name: "豆包", url: "https://www.doubao.com", desc: "对话式改图，适合快速出方案" },
      { name: "LibLib", url: "https://www.liblib.art", desc: "模型广场，可 API 调用（账号已可申请）" },
    ],
    sop: "1. 先写清画面要素：主体/场景/风格/比例\n2. 一次出 4 张选最佳，局部不满意用局部重绘\n3. 印刷物料注意分辨率（AI 图需放大或矢量重制）",
  },
  {
    category: "声音复刻",
    icon: "🎙",
    tools: [
      { name: "剪映·克隆音色", url: "https://www.capcut.cn", desc: "手机即可录制样本，最快上手" },
      { name: "火山引擎声音复刻", url: "https://www.volcengine.com", desc: "效果好，适合正式项目（按量计费）" },
      { name: "Fish Audio", url: "https://fish.audio", desc: "网页端免装，免费额度可试用" },
    ],
    sop: "1. 准备 10~30 秒清晰干声（无背景音）\n2. 在工具内创建音色并试听\n3. 输入文稿生成配音，导出 WAV 进剪辑流程",
  },
  {
    category: "对口型",
    icon: "👄",
    tools: [
      { name: "即梦·对口型", url: "https://jimeng.jianying.com", desc: "上传人像视频+音频自动对口型" },
      { name: "腾讯智影", url: "https://zenvideo.qq.com", desc: "数字人+口型一体，网页端" },
      { name: "RunningHub", url: "https://www.runninghub.cn", desc: "ComfyUI 工作流，可批量可 API" },
    ],
    sop: "1. 准备正脸清晰视频（光线均匀、无遮挡）\n2. 先用声音复刻生成配音\n3. 对口型合成后检查牙齿/嘴角细节",
  },
  {
    category: "数字人口播",
    icon: "🧑‍💼",
    tools: [
      { name: "腾讯智影", url: "https://zenvideo.qq.com", desc: "数字人播报，免费额度适合试水" },
      { name: "闪剪", url: "https://shanjian.tv", desc: "口播短视频批量产出" },
      { name: "剪映·图文成片", url: "https://www.capcut.cn", desc: "文案一键成片， fastest 出片" },
    ],
    sop: "1. LLM 写口播稿（控制在成片 60 秒内）\n2. 选数字人形象与音色生成\n3. 加字幕、包装后导出发布",
  },
];

export default function AiPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold">AI 能力导航</h1>
        <p className="text-sm text-ink-300 mt-1">每类任务对应的推荐工具与标准操作流程（SOP）。API 集成（DeepSeek / 火山 / RunningHub / LibLib）预留至 M4。</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {TOOLS.map((cat) => (
          <Card key={cat.category} className="p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <span className="text-xl">{cat.icon}</span>{cat.category}
            </h3>
            <div className="space-y-2 mb-4">
              {cat.tools.map((t) => (
                <a key={t.name} href={t.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2.5 hover:border-brand hover:bg-brand-50/40 transition">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-ink-300 ml-3 flex-1 text-right truncate">{t.desc}</span>
                </a>
              ))}
            </div>
            <div className="bg-ink-50 rounded-lg p-3">
              <Badge tone="orange">SOP</Badge>
              <pre className="text-xs text-ink-500 mt-2 whitespace-pre-wrap font-sans leading-relaxed">{cat.sop}</pre>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
