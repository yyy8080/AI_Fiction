# 回滚人生 · 章节复制工具

一个纯静态网页，用来把《回滚人生》每一章的**标题**和**正文**快速复制出去，粘贴到番茄 / 起点等平台。
没有后端，所有章节在构建时预处理成 JSON，前端直接加载。

## 功能

- 左侧章节目录，按卷分组，支持按**章号**或**标题**搜索（回车直接跳到第一个命中项）
- 阅读区显示当前章标题 + 正文，纯文本排版，段落间距按长文阅读调过
- 三个一键复制按钮：**复制标题** / **复制正文** / **复制标题+正文**（标题与正文之间空一行）
- 上一章 / 下一章，首尾章自动禁用
- 复制成功后按钮变成「已复制 ✓」，并弹出提示条（含字符数）
- 批量导出第 N–M 章：复制成一段文本，或下载 `.txt`
- 手机适配：目录变抽屉，复制按钮固定在底部，拇指可达
- 键盘快捷键：`←` `→` 翻章，`C` 复制标题+正文，`/` 聚焦搜索，`Esc` 关闭弹层
- 自动跟随系统深色模式；正文字号可切换（记忆在本地）
- 地址栏带章节号（`#/ch/250`），可直接分享/收藏；下次打开自动回到上次读的那一章

## 在线访问

站点部署后可直接打开，见仓库根 README 与本文档下方「部署到 GitHub Pages」。
章节深链形如 `<站点地址>/#/ch/250`。

## 本地预览

页面通过 `fetch` 读取 `data/*.json`，**必须走 HTTP 服务器**，直接双击 `index.html`（`file://`）会因为浏览器跨域策略加载失败。

```bash
cd novels/rollback-life/reader

# 任选其一
python3 -m http.server 8099
npx serve -l 8099 .
```

然后打开 <http://localhost:8099/>。

## 重新生成章节数据

正文改动后需要重跑构建脚本：

```bash
cd novels/rollback-life/reader
node build.mjs             # 需要 Node 18+
node build.mjs --check 500 # 顺便断言章节总数
```

脚本会扫描 `../chapters-*.md`（**忽略 `archive/`**），按 `# 第N章 标题` 切分（兼容 `##`/`###` 与「第五十六章」这类中文数字写法），并写出：

| 文件 | 内容 |
|---|---|
| `data/chapters.json` | 目录清单：章号、标题、字数、所属卷、所在分卷文件（约 90 KB，首屏只加载这个） |
| `data/part-001-050.json` … | 分卷正文，每 50 章一个文件，点到哪一卷才加载哪一卷 |

参数：

- `--part-size <n>`：每个分卷文件多少章，默认 50
- `--check <n>`：章节总数不等于 n 时构建失败（CI 用）
- `--out <dir>`：输出目录，默认 `./data`

构建时会顺带报出两类问题：章号缺失/重复，以及正文里夹在汉字中间的半角标点。

正文转换规则（面向「复制出去就能发」）：去掉 `---` 分隔线、`**加粗**`、`` `代码` `` 等 Markdown 标记，保留段落与空行。
文件开头位于第一章之前的引用块（如「卷五 · 结算｜结局A」那段编者按）会挂在该文件首章上单独展示，**不计入复制内容**。

## 部署到 GitHub Pages

### 方式一（推荐）：GitHub Actions，站点根目录 = 本目录

仓库已带 `.github/workflows/pages.yml`。在 GitHub 上：

**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

之后推送到 `main` 会自动构建并发布，站点地址：

```
https://yyy8080.github.io/AI_Fiction/
```

也可以在 **Actions → Deploy reader to GitHub Pages → Run workflow** 手动触发一次。

### 方式二：从分支发布（不需要 Actions）

**Settings → Pages → Source** 选 **Deploy from a branch**，分支 `main`、目录 `/ (root)`。
仓库根已放了 `.nojekyll` 和一个跳转页，所以：

- `https://yyy8080.github.io/AI_Fiction/` 会自动跳到阅读器
- 直达地址是 `https://yyy8080.github.io/AI_Fiction/novels/rollback-life/reader/`

### 方式三：任意静态托管

页面内全部使用相对路径，把 `novels/rollback-life/reader/` 整个目录（含 `data/`）传到 Cloudflare Pages、Vercel、Netlify、对象存储等任意静态托管即可，无需额外配置。

## 目录结构

```
reader/
├── index.html          页面
├── build.mjs           构建脚本：chapters-*.md → data/*.json
├── assets/
│   ├── styles.css
│   └── app.js
└── data/               构建产物（已提交，便于直接托管）
    ├── chapters.json
    └── part-001-050.json …
```
