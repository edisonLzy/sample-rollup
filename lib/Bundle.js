import fs from 'node:fs';
import path from 'node:path';
import MagicString from 'magic-string';
import Module from './Module';
export default class Bundle {
  constructor({ entry }) {
    this.entryPath = entry;
    this.modules = {}; // 本次打包的所有模块
    this.statements = []; // 本次收集得到的所有statement
  }
  build(filename) {
    // 1. 构建入口模块
    const entryModule = this.fetchModule(this.entryPath);
    // 2. 递归解析依赖模块
    this.statements = entryModule.expandAllStatements();
    const { code } = this.generate();

    console.log(code, path.join(process.cwd(), filename));
    fs.writeFileSync(path.join(process.cwd(), filename), code);
  }
  fetchModule(importee, importer) {
    let route;
    if (!importer) {
      route = importee;
    } else {
      if (path.isAbsolute(importee)) {
        route = importee;
      } else if (importee[0] === '.') {
        route = path.resolve(
          path.dirname(importer),
          importee.replace(/\.js$/, '') + '.js'
        );
      }
    }
    if (route) {
      const code = fs.readFileSync(route, 'utf-8');
      const module = new Module({
        code,
        path: importee,
        bundle: this,
      });
      return module;
    }
  }
  generate() {
    const ms = new MagicString.Bundle();
    this.statements.forEach((statement) => {
      const source = statement._source.clone();
      ms.addSource({
        content: source,
        separator: '\n',
      });
    });
    return {
      code: ms.toString(),
    };
  }
}
