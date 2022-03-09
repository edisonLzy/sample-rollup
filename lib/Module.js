import MagicString from 'magic-string';
import { parse } from 'acorn';
import analyse from './ast/analyse';
import { hasOwn } from './utils';
const SYSTEM_VARIABLE = ['console', 'log'];
export default class Module {
  constructor({ code, path, bundle }) {
    this.code = new MagicString(code, {
      filename: path,
    });
    this.path = path;
    this.bundle = bundle;
    this.ast = parse(this.code, {
      ecmaVersion: 7,
      sourceType: 'module',
    });

    this.imports = {};
    this.exports = {};
    this.definitions = {}; // 收集 变量定义的语句
    this.modifications = {}; // 修改的变量
    this.analyse();
  }
  analyse() {
    // 收集导入和导出变量
    this.ast.body.forEach((node) => {
      if (node.type === 'ImportDeclaration') {
        const source = node.source.value; // ./company1
        node.specifiers.forEach((specifier) => {
          const { name: localName } = specifier.local;
          const { name } = specifier.imported;
          this.imports[localName] = {
            // 收集当前模块中导入的变量
            source,
            name,
            localName,
          };
        });
      } else if (node.type === 'ExportNamedDeclaration') {
        const { declaration } = node;
        if (declaration.type === 'VariableDeclaration') {
          const { name } = declaration.declarations[0].id;
          this.exports[name] = {
            node,
            localName: name,
            expression: declaration,
          };
        }
      }
    });
    // 创建作用域链并解析确定 statement _defines 和 _dependsOn
    analyse(this.ast, this.code, this);
    this.ast.body.forEach((statement) => {
      Object.keys(statement._defines).forEach((name) => {
        // 将定义的变量与当前模块进行关联
        this.definitions[name] = statement;
      });
      Object.keys(statement._modifies).forEach((name) => {
        if (!hasOwn(this.modifications, name)) {
          this.modifications[name] = [];
        }
        // 可能有多处修改
        this.modifications[name].push(statement);
      });
    });
  }
  expandAllStatements() {
    const allStatements = [];
    this.ast.body.forEach((statement) => {
      // 过滤`import`语句
      if (statement.type === 'ImportDeclaration') {
        return;
      }
      // 递归收集所有依赖模块的 statements
      const statements = this.expandStatement(statement);
      allStatements.push(...statements);
    });
    return allStatements;
  }
  expandStatement(statement) {
    // 将该statement标记为已展开
    statement._included = true;
    const result = [];
    const dependencies = Object.keys(statement._dependsOn);
    dependencies.forEach((name) => {
      // 查找依赖变量的定义语句
      const definition = this.define(name);
      result.push(...definition);
    });
    result.push(statement);
    const defines = Object.keys(statement._defines);
    defines.forEach((name) => {
      const modifications =
        hasOwn(this.modifications, name) && this.modifications[name];
      if (modifications) {
        modifications.forEach((modif) => {
          if (!modif._included) {
            const statements = this.expandStatement(modif);
            result.push(...statements);
          }
        });
      }
    });
    return result;
  }
  define(var_name) {
    if (hasOwn(this.imports, var_name)) {
      // 1. 导入 company2
      const importDeclaration = this.imports[var_name];
      // 2. 开始解析 ./compay2
      const mod = this.bundle.fetchModule(importDeclaration.source, this.path);
      const exportDeclaration = mod.exports[importDeclaration.name];
      if (!exportDeclaration) {
        throw new Error(
          `Module ${mod.path} does not export ${importDeclaration.var_name} (imported by ${this.path})`
        );
      }
      return mod.define(exportDeclaration.localName);
    } else {
      // 不是导入的变量，说明是当前作用域中声明的变量
      let statement = this.definitions[var_name];
      if (statement) {
        if (statement._included) {
          return [];
        } else {
          return this.expandStatement(statement);
        }
      } else if (SYSTEM_VARIABLE.includes(var_name)) {
        return [];
      } else {
        throw new Error(`variable '${var_name}' is not exist`);
      }
    }
  }
}
