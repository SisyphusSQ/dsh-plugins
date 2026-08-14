# Packages

This directory will contain independently installable DeepSeek Harness plugin packages. It intentionally contains no package scaffold yet.

## 新增包的条件

只有在具体插件范围、运行时边界和验证入口已经讨论清楚后，才在本目录新增包。每个正式包至少需要：

```text
packages/dsh-example/
├── src/
├── tests/
├── README.md
├── package.json
└── cordis.patch.yml
```

同时满足以下约定：

- 一个包对应一个可独立安装的能力；
- 包名以 `dsh-` 开头，不使用中文路径；
- `package.json` 只声明实际存在且可以加载的入口；
- 只有真实 profile bundle 才声明 `dsh.bundle`，并在其中提供 `patch` 字段；
- README 记录已验证的 DSH 版本、安装方式、配置、卸载方式和验证边界；
- 聚合包只依赖已经稳定发布的独立包，不包含实验性能力；
- 共享包只在出现可证明的重复实现后创建。

需要修改 DSH 核心才能运行的探索内容，应先单独讨论其归属，不直接放进正式插件目录。
