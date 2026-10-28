# ROADMAP · MiniDB 接下来要长出的东西

规则：每天只取最上面一件未完成的事，做完打勾，并在 CHANGELOG 记一笔。
清单只剩不到 3 件时，再补 5 件新的——永远小步，永远不贪多。

- [x] Day 0 · 立地基：TypeScript + Vite 工程；手写词法分析器、递归下降语法分析器（AST）；执行器支持 CREATE TABLE / INSERT（多行）/ SELECT（WHERE 逻辑表达式、ORDER BY、LIMIT）/ DROP TABLE；类型检查；网页控制台（编辑器、结果网格、结构侧栏、执行日志）；localStorage 持久化；Vitest 单元测试；CI + GitHub Pages 自动部署
- [ ] Day 1 · UPDATE / DELETE：带 WHERE 的更新与删除，报告受影响行数
- [ ] Day 2 · 哈希索引：CREATE INDEX 建哈希索引，WHERE 等值查询走 Index Scan，计划里对比扫描行数
- [ ] Day 3 · B+ 树索引：实现 B+ 树（插入、查找、范围扫描），等值与范围查询可用
- [ ] Day 4 · B+ 树可视化：控制台里画出 B+ 树的节点与分裂过程
- [ ] Day 5 · 事务：BEGIN / COMMIT / ROLLBACK，基于快照的回滚
- [ ] Day 6 · JOIN：两表 INNER JOIN（嵌套循环），计划显示 Nested Loop Join
- [ ] Day 7 · 聚合：COUNT / SUM / AVG / MIN / MAX 与 GROUP BY
- [ ] Day 8 · 页式存储：表数据落成定长页（page）模型，控制台展示页占用与行布局
