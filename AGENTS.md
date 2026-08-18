# dsh-plugins 协作约定

## 仓库定位

本仓库是 DeepSeek Harness（DSH）第三方插件的 pnpm monorepo。`packages/` 下每个目录对应一个可独立安装的插件。

## 包边界

- `packages/` 下一个目录对应一个可独立安装、独立说明和独立验证的能力。
- 包名统一使用英文小写与连字符，并以 `dsh-` 开头。
- 只有具备真实插件入口与 `cordis.patch.yml` 的包才可以声明 `dsh.bundle`。
- host 与 client 能力是否拆包，以能否独立安装和是否引入不同运行时依赖为判断依据。
- 不为尚未出现的复用需求预先创建 `shared`、`core` 或 `utils` 包。
- 需要修改 DSH 核心才能成立的实验，不得伪装成纯插件放入正式 `packages/`。

## 兼容性与验证

- DSH 仍处于 developer preview；每个插件必须明确记录已验证的 DSH 版本和兼容边界。
- 不把类型检查、构建、fixture 或本地链接验证描述为真实 DSH Web/Headless E2E。
- 真实 DSH Web 验证直接把插件装进日常 `web` profile，在 `http://127.0.0.1:3080` 上测。不要另起隔离 profile 或隔离端口，除非用户明确要求。
- 新增包时再引入其实际需要的构建、测试和发布依赖，不在仓库根目录预装猜测性的工具链。

## 文档与交付

- README 默认英文（`README.md`），中文为 `README.zh.md`，页顶互相链接。
- README 只写已交付能力；路线图、未完成项和已知限制不进入 README，需要时写在 `docs/design/`。
- 发布到 registry 之前，README 不写安装命令和 registry 包名。
- Issue、PR 和 MR 默认使用中文；命令、路径、包名和错误原文可保留英文。
- 发布前必须确认 npm 包内容、DSH profile 安装结果和版本兼容记录；无可安装产物时不得创建 Release。
