# 项目结构与数据边界

## 源码

- `src/`：界面、业务逻辑、仓储和联网服务。
- `src-tauri/`：Windows 桌面入口、SQLite 迁移、权限和平台图标。
- `public/`：随前端打包的静态资源。

## 品牌资产

- `assets/branding/rin-icon-master.png`：生成并清理后的图标母版。
- `assets/branding/ICON_PROMPT.md`：图标生成提示词和设计约束。
- `src-tauri/icons/`：由母版生成的平台尺寸，不要手工逐个编辑。

## 本地生成内容

- `node_modules/`、`dist/`、`src-tauri/target/`：可重新生成，不提交 Git。
- `tools/bootstrap/`：Rust 与 Visual Studio 构建工具安装器，仅用于本机环境，不提交 Git。
- `releases/`：保存本地发布记录；安装包作为 GitHub Release 附件上传，不进入 Git 历史。

## 用户数据

SQLite 数据库、背景图设置和自动备份位于 Windows 用户数据目录，不在工程目录内。移动、克隆或重新构建工程不会删除用户待办。
