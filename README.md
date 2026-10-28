# MiniDB · 浏览器里的迷你数据库

A miniature SQL database engine that runs entirely in your browser — tokenizer, parser, and executor written from scratch in TypeScript. No server, no WASM, no dependencies at runtime.

一个从零写起的迷你数据库引擎：词法分析、语法分析、执行器全部手写，跑在浏览器里。它是一个每天长大一点点的学习型项目——目标是把真实数据库的核心部件一个一个亲手实现出来：索引、查询计划、事务、页式存储……

## 在线试玩

👉 https://mai1aki.github.io/minidb/

打开就能写 SQL，示例数据已经备好；你建的表会保存在浏览器的 localStorage 里。

## Day 0 已支持的 SQL

```sql
CREATE TABLE users (id INT, name TEXT, age INT, city TEXT);
INSERT INTO users VALUES (1, 'Alice', 31, 'New York'), (2, 'Bob', 24, 'Seattle');
SELECT name, age FROM users WHERE age >= 28 AND city = 'New York' ORDER BY age DESC LIMIT 3;
DROP TABLE users;
```

- 类型：`INT` / `FLOAT` / `TEXT` / `BOOL`，插入时做类型检查
- `WHERE` 支持 `= != < <= > >=`、`AND / OR / NOT` 和括号
- `ORDER BY ... ASC|DESC`、`LIMIT`
- 每条 SELECT 都会报告执行计划（如 `Seq Scan on users`）和扫描行数
- 控制台支持一次运行多条语句（`;` 分隔），并展示每条语句的执行日志

## 架构

```
SQL 文本
  → src/sql/tokenizer.ts   词法分析：文本 → Token 流
  → src/sql/parser.ts      递归下降语法分析：Token 流 → AST
  → src/engine/database.ts 执行器：按 AST 读写表，生成执行计划
  → src/main.ts            网页控制台：编辑器、结果网格、结构侧栏
```

表数据是纯 JSON 结构，可序列化——这是后面做页式存储和事务回滚的起点。

## 本地开发

```bash
npm install
npm run dev     # 开发服务器
npm test        # 单元测试（Vitest）
npm run build   # 类型检查 + 构建到 dist/
```

## 路线图

见 [ROADMAP.md](ROADMAP.md)：UPDATE/DELETE、哈希索引、B+ 树索引与可视化、EXPLAIN 计划面板、事务、JOIN、聚合、页式存储……每天一小步。

## 许可

MIT
