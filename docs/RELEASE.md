# 发布流程

1. 更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和应用“关于”页版本号。
2. 执行 `pnpm build`。
3. 执行 `pnpm tauri build --no-bundle`，审核独立 `exe`。
4. 审核通过后执行 `pnpm tauri:build` 生成 NSIS 安装包。
5. 计算安装包 SHA-256，并写入对应的 `releases/<version>/README.md`。
6. 提交源码并推送 GitHub。
7. 创建相同版本的 GitHub Release，将安装包与校验文件作为 Release Assets 上传。

安装包不直接提交到 Git 仓库，避免仓库历史被重复的二进制文件膨胀；它仍会随 GitHub Release 对外提供。
