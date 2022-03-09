import Scope from './Scope';
import walk from './walk';
export default function analyse(ast, ms, module) {
  // 创建当前模块的作用域
  let scope = new Scope();
  // 创建作用域链
  // 如果是创建变量则建立 statement和变量之间的关系 _defines
  ast.body.forEach((statement) => {
    function addToScope(declarator, isBlockDeclaration = false) {
      const { name } = declarator.id;
      scope.add(name, isBlockDeclaration);
      if (!scope.parent) {
        // 如果没有上层作用域，说明是模块内的顶级作用域
        // 建立statement和它定义变量之间的关系
        statement._defines[name] = true;
      }
    }
    Object.defineProperties(statement, {
      _module: {
        // module实例
        value: module,
      },
      _source: {
        // 源代码
        value: ms.snip(statement.start, statement.end),
      },
      _defines: {
        // 当前语句定义的变量
        value: {},
      },
      _modifies: {
        // 修改的变量
        value: {},
      },
      _dependsOn: {
        // 当前模块没有定义的变量，即外部依赖的变量
        value: {},
      },
      _included: {
        // 是否已经包含在输出语句中
        value: false,
        writable: true,
      },
    });
    walk(statement, {
      enter(node) {
        let newScope;
        switch (node.type) {
          case 'VariableDeclaration':
            node.declarations.forEach((variableDeclarator) => {
              if (node.kind === 'let' || node.kind === 'const') {
                addToScope(variableDeclarator, true);
              } else {
                addToScope(variableDeclarator, false);
              }
            });
            break;
        }
        if (newScope) {
          Object.defineProperty(node, '_scope', {
            value: newScope,
          });
          scope = newScope;
        }
      },
      leave(node) {
        if (node._scope) {
          // 如果当前的statement创建了新的作用域
          // 则返回到其父作用域
          scope = scope.parent;
        }
      },
    });
  });
  ast._scope = scope;
  // 根据作用域查找规则, 确定 statement中的Identifier是否是外部变量
  ast.body.forEach((statement) => {
    function checkForReads(node) {
      if (node.type === 'Identifier') {
        const { name } = node;
        const definingScope = scope.findDefiningScope(name);
        // 作用域链中找不到 则说明为外部依赖
        // if (!definingScope) {
        statement._dependsOn[name] = true;
        // }
      }
    }
    // 收集变量修改的语句
    function checkForWrites(node) {
      function addNode(n) {
        while (n.type === 'MemberExpression') {
          // var a = 1; var obj = { c: 3 }; a += obj.c;
          n = n.object;
        }
        if (n.type !== 'Identifier') {
          return;
        }
        statement._modifies[n.name] = true;
      }
      if (node.type === 'AssignmentExpression') {
        addNode(node.left);
      } else if (node.type === 'UpdateExpression') {
        // var a = 1; a++
        addNode(node.argument);
      } else if (node.type === 'CallExpression') {
        node.arguments.forEach(addNode);
      }
    }
    walk(statement, {
      enter(node) {
        if (node._scope) {
          scope = node._scope;
        }
        checkForReads(node);
        checkForWrites(node);
      },
      leave(node) {
        if (node._scope) {
          scope = scope.parent;
        }
      },
    });
  });
}
