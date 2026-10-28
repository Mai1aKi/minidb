# CHANGELOG · MiniDB 的生长记录

## Day 0 — 2026-10-28

MiniDB 出生。今天落成的地基：

- 工程脚手架：TypeScript（strict）+ Vite + Vitest，零运行时依赖；GitHub Actions 跑测试并自动部署 GitHub Pages
- 词法分析器（`src/sql/tokenizer.ts`）：关键字/标识符/数字/字符串（`''` 转义）/运算符，支持 `--` 行注释
- 语法分析器（`src/sql/parser.ts`）：递归下降，产出 AST；表达式优先级 OR < AND < NOT < 比较
- 执行器（`src/engine/database.ts`）：
  - `CREATE TABLE`（INT/FLOAT/TEXT/BOOL，重复列名报错）
  - `INSERT` 多行插入，带列清单与类型检查，未指定列填 NULL
  - `SELECT` 列投影、`WHERE` 逻辑表达式、`ORDER BY`、`LIMIT`，计划报告 `Seq Scan` 与扫描行数
  - `DROP TABLE`
  - 脚本执行：多条语句顺序运行，首个错误处停下
  - 表数据 JSON 序列化 / 反序列化
- 网页控制台：SQL 编辑器（Ctrl/Cmd+Enter 运行）、示例查询、执行日志、结果网格、结构侧栏，数据持久化到 localStorage
- 单元测试 26 个：tokenizer / parser / executor 全覆盖核心路径
