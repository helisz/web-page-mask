# PDF 打码工具 · web-page-mask

纯前端的 PDF 遮盖工具：上传 PDF → 框选区域 → 马赛克 / 模糊 / 纯色 → 按页导出 PNG / JPG。
所有渲染与导出都在浏览器本地完成，**PDF 不会上传到任何服务器**。

技术栈：Vue 3 + TypeScript + Vite + Tailwind CSS v4 + shadcn-vue 风格组件（基于 reka-ui 原语）+ pdf.js v6 + JSZip。

---

## 功能

**浏览**
- 拖拽或选择 PDF，左侧缩略图快速跳页（懒加载）
- 翻页（按钮 / 页码输入 / ← → 键）、缩放（按钮 / 百分比回 100% / 适合宽度 / 整页 / Ctrl+滚轮以光标为中心缩放）
- 放大后可拖拽平移（手型工具、按住空格、鼠标中键均可）

**打码**
- 在页面上拖拽即框选，实时看到效果
- 三种方式：像素化马赛克（默认）、高斯模糊、纯色块
- 三种形状：**长方形（默认）/ 正方形 / 圆形**；正方形与圆形在 PDF 点单位下等宽高，导出同样生效
- 马赛克单块大小 4–48 px 可调（以 100% 缩放下的像素计，导出时按比例换算，视觉一致）
- 选中遮罩后可拖动、八向拉伸；支持按住 Shift 之外的常规操作、删除单块、清空本页 / 全部
- 完整撤销 / 重做（撤销栈按手势合并，连续拖动只算一步）

**导出**
- 范围：当前页 / **有遮罩的页面** / 全部页面 / 自选页码（`1-3, 5`）
- 格式：PNG（无损）、JPG（质量可调）、**PDF（多页合并成一个文档）**
- 尺寸两种模式：
  - **像素**：填宽，高度按页面比例自动算；解锁后可自定义非等比（会提示拉伸）
  - **DPI**：72 / 144 / 288 / 300 预设，**推荐 144 DPI**
- 多页图片自动打包为一个 ZIP；PDF 则把多页合并成一个文件，单页直接下载
- 遮罩被烘焙进位图，导出文件里没有可选文本，原 PDF 文字不会被复制出来

**其他**
- 简体中文 / 繁體中文 / English 三语界面
- 深色 / 浅色主题，跟随系统
- 快捷键面板、Toast 提示、空状态、加载态、错误态
- 移动端：右侧设置面板变为抽屉

---

## 快速开始

需要 Node.js ≥ 20，包管理用 **npm**（仓库自带 `package-lock.json`）：

```bash
npm install         # 一次性安装依赖（npm 会自动跑 esbuild 等构建脚本）
npm run dev         # http://localhost:5173
npm run build       # 类型检查 + 产物到 dist/
npm run preview     # 预览生产构建
```

用 pnpm / yarn 也能装（`package.json` 不绑定包管理器），但仓库只维护 npm 的锁文件。

打开后可以直接点 **先看看示例**（`public/sample.pdf`），示例文档里的「身份证号 / 家庭住址 / 银行卡号」正好可以用来试框选。

---

## 使用流程

1. 拖入 PDF，或点「选择 PDF 文件」/ 按 `⌘/Ctrl + O`
2. 用「框选」工具在页面上拖出矩形；右侧可切换「长方形 / 正方形 / 圆形」
3. 右侧面板选择打码方式；马赛克里调「块大小」，块越大越难还原
4. 需要时继续框选多块，或换页继续；`⌘/Ctrl + Z` 可撤销
5. 点「导出」，选择范围（可只导**有遮罩的页面**）、格式（PNG / JPG / PDF）、尺寸后导出

---

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `←` `→` / `PageUp` `PageDown` | 上一页 / 下一页 |
| `+` `-` | 放大 / 缩小 |
| `0` | 适合宽度 |
| 空格 + 拖动 | 平移画布 |
| `V` / `H` | 框选工具 / 平移工具 |
| `Delete` / `Backspace` | 删除选中的遮罩 |
| `Esc` | 取消选择 |
| `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` | 撤销 / 重做 |
| `⌘/Ctrl + O` | 打开 PDF |

---

## 实现要点

**遮罩数据模型**（`src/types.ts`）

```ts
{ id, page, x, y, w, h, style, shape, block, color }
```

`x/y/w/h` 是相对页面的归一化坐标（0–1），`block` 以 PDF 点（pt）为单位，`shape` 为 `rect | square | circle`。因为是归一化 + 物理单位，同一份数据在任意缩放、任意导出 DPI 下重绘结果完全一致；正方形/圆形按「点」保持等宽高（`w * pageWidth === h * pageHeight`），所以换页面比例也不会被拉成椭圆。圆形的裁剪用 canvas 的 `ellipse` 路径 + `clip()`，屏幕、缩略图和导出走同一段代码。

**渲染管线**

1. `pdf.js` 把页面渲染到 `<canvas>`（按 devicePixelRatio 放大，超大画布自动降采样保护）
2. 遮罩在独立的 overlay canvas 上实时合成，底图始终保持"干净"，所以重叠、修改都不会污染像素
3. 导出时按目标分辨率重新渲染底图，再用同一套 `paintMasks()` 重绘遮罩 —— 4x / 300 DPI 导出依然清晰，不是把屏幕截图放大

马赛克算法：把区域降采样到 `ceil(w / block) × ceil(h / block)`，再以 `imageSmoothingEnabled = false` 放大回去，得到真正的像素块。

**PDF 导出**（`src/lib/pdfExport.ts`）

不引入 PDF 库，直接手写一个最小 PDF 写出器：每页嵌一张「遮罩已烘焙」的位图，`MediaBox` 用原页面的 pt 尺寸，所以 144 DPI 导出的 A4 打印出来仍是 A4。

- 默认走**无损**：`canvas.getImageData` → 去 alpha 的 RGB 扫描线 → `CompressionStream('deflate')` 压缩 → `/Filter /FlateDecode`
- 没有 `CompressionStream` 的浏览器自动退化为 `/Filter /DCTDecode`（JPEG 质量滑块仍生效）
- 对象、`xref` 偏移、`startxref` 全部按字节流手写；单文件下载，多页按页码顺序合并
- 代价：PDF 是图片型的，页面里的文字**不可选中 / 搜索**（这正是打码想要的效果，见「已知限制」）

**几个工程细节**

- 中文 PDF 需要 CMaps 与标准字体：构建时把 `pdfjs-dist` 的 `cmaps / standard_fonts / wasm / iccs` 复制到 `public/pdfjs`，完全离线可用
- 同一 PDF 页的 `render()` 不能并发，内部用一条串行队列（`exclusiveRender`）协调主视图、缩略图和导出
- 导出画布有浏览器上限保护（单边 16384 px、面积 8000 万像素），超出时自动收敛并在界面提示
- 组件按 shadcn-vue 的结构手写（`src/components/ui`），避免 CLI 交互式安装，样式 token 与 shadcn 的 zinc 主题一致

---

## 目录结构

```
src/
  components/
    ui/               shadcn 风格基础组件（button/input/slider/modal/segmented/select/switch/tip）
    AppHeader.vue     顶栏：打开、语言、主题、导出
    Sidebar.vue       缩略图侧栏
    ThumbItem.vue     单页缩略图（IntersectionObserver 懒加载）
    ViewerToolbar.vue 翻页 / 缩放 / 工具切换
    PdfViewer.vue     画布渲染 + 框选 / 移动 / 拉伸交互
    MaskPanel.vue     打码设置、遮罩列表、撤销重做
    ExportDialog.vue  导出范围 / 格式 / 尺寸 / 进度
    HelpDialog.vue    快捷键
    DropZone.vue      空状态
  lib/
    pdf.ts            pdf.js 加载、页尺寸缓存、渲染串行队列
    mosaic.ts         马赛克 / 模糊 / 纯色绘制
    export.ts         尺寸计算、导出、ZIP 打包
  stores/editor.ts    全局状态、遮罩、历史栈、偏好持久化
  i18n/               zh-CN / zh-TW / en 文案
  dev/selftest.ts     开发期页内自检（?selftest=1）
```

---

## 开发自检

```bash
npm run typecheck
npm run build

# 先启动 dev 服务（QA 脚本默认连 5179）
npm run dev -- --port 5179

npm run qa:ui       # 布局、键盘、对话框、分页遮罩隔离、形状裁剪、范围选项、语言、主题
npm run qa:export   # 真实下载：3 页 ZIP 尺寸校验、JPG 文件头、PDF 用 pdf.js 回读校验
npm run qa:mobile   # 390 / 820 两档响应式（含 4 个导出范围是否溢出）
npm run qa:demo     # 示例文档的预设遮罩是否压住文字
npm run selftest    # 页内像素级断言：渲染、框选、撤销、形状、导出烘焙、PDF 回读
npm run qa          # 以上全部
npm run make-pdf-sample   # 用示例文档真实导出一份 shots/masked-sample.pdf 供人工查看
```

调试用参数：

- `?demo=1` 打开示例 PDF
- `?demo=1&seed=1` 同时预置三个示例遮罩（像素化 / 模糊 / 纯色）
- `?selftest=1` 跑页内自检并把报告写进 `<pre id="selftest-report">`

`scripts/sample-source.html` 是示例 PDF 的源文件，`npm run make-sample` 可用本机 Chrome/Edge 重新生成（找不到浏览器时脚本会提示设置 `CHROME_PATH`）。

---

## 安全与依赖

- 纯前端，PDF 只在浏览器内存里，不会发起任何上传请求（`fetch` 只用于本地 `sample.pdf` 与 pdf.js 资源）
- `pdfjs-dist` 固定在 **6.5.x**：5.x 存在「打开恶意 PDF 可执行任意 JS」的公告（GHSA-hq66-cqwq-w95j），6.x 已修复
- `npm audit` 当前 0 漏洞；图标库使用未废弃的 `@lucide/vue`

## 已知限制

- 不支持加密 / 需要密码的 PDF（会给出明确提示）
- 打码是**栅格化遮盖**，不修改原始 PDF；如需在 PDF 层面删除文本层，需要 OCR / 重新生成文档
- 导出的 PDF 是**图片型**（每页一整张位图）：文字不可选中、不可搜索，体积也比原始文本 PDF 大得多；要保留文本层请导出 PNG/JPG 后自行合成
- 缩略图为后台串行渲染，超长文档首屏会逐页补齐
- 导出为纯前端实现，页数很多 + 300 DPI 时内存占用较高

## 部署

`npm run build` 产物在 `dist/`，可直接放到任意静态托管（Nginx、S3、GitHub Pages 等）。
部署到子路径时在 `vite.config.ts` 里设置 `base: '/your-path/'`，pdf.js 资源路径会自动跟随 `BASE_URL`。
