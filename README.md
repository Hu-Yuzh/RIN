# 铃RIN

铃RIN 是一款轻量的日历、待办与天气桌面应用。前端使用 React、TypeScript 与 Vite，桌面容器使用 Tauri 2，本地数据保存到 SQLite。

## 当前功能

- 年、月、日三种日历视图
- 有日期和无日期待办、分类颜色、完成状态与搜索
- 节假日及调休标记
- 城市搜索与未来 16 天天气
- 自定义背景、主题色、文字颜色及自动配色
- 日历收纳模式
- JSON 导入、导出与自动备份
- SQLite 数据迁移

## 目录结构

```text
RIN/
├─ assets/branding/       品牌图标母版与生成说明
├─ docs/                  架构、发布和维护文档
├─ public/                前端静态资源
├─ releases/              本地发布产物说明；安装包本身不提交 Git
├─ src/                   React 前端源码
├─ src-tauri/             Tauri、Rust、迁移与平台图标
├─ tools/bootstrap/       本机构建工具安装器，不提交 Git
├─ package.json
└─ README.md
```

更完整的说明见 [项目结构](docs/PROJECT_STRUCTURE.md) 和 [发布流程](docs/RELEASE.md)。

## 开发命令

```powershell
pnpm install
pnpm build
pnpm tauri:dev
```

## 构建

仅构建审核版可执行文件：

```powershell
pnpm tauri build --no-bundle
```

构建 Windows 安装程序：

```powershell
pnpm tauri:build
```

## 数据兼容

应用显示名称已更改为“铃RIN”，但仍保留 `com.rihe.calendar` 标识符和 `rihe.db` 数据库名，以保证旧版本数据能够继续使用。用户数据不存放在源码仓库中。
