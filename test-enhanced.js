var FormValidator = require('./form-validator.js');

var totalTests = 0;
var passedTests = 0;
var failedTests = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log('PASS: ' + name);
  } catch (e) {
    failedTests.push({ name: name, error: e.message });
    console.log('FAIL: ' + name + ' - ' + e.message);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || '值不相等') + ' - 预期: ' + JSON.stringify(expected) + ', 实际: ' + JSON.stringify(actual));
  }
}

console.log('========== 智能表单校验类库增强版测试 ==========');
console.log('');

// ==============================================
// 第一部分：基础回归测试（确保原有功能正常）
// ==============================================
console.log('--- 一、基础功能回归测试 ---');

test('基础字段注册和校验', function () {
  var validator = new FormValidator();
  validator.registerField('username', {
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 20
  });
  var result = validator.validateField('username', 'test');
  assert(result.valid === true, '有效值应通过校验');
  assert(result.errors.length === 0, '不应有错误');
});

test('必填字段校验', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var result = validator.validateField('name', '');
  assert(result.valid === false, '空值应不通过');
  assert(result.errors[0].rule === 'required', '应为 required 错误');
});

test('getFirstError 正确返回首个错误', function () {
  var validator = new FormValidator();
  validator.registerFields({
    fieldA: { type: 'text', required: true, label: '字段A' },
    fieldB: { type: 'text', required: true, label: '字段B' }
  });
  validator.validateAll({ fieldA: '', fieldB: '' });
  var first = validator.getFirstError();
  assert(first !== null, '应有首个错误');
  assert(first.field === 'fieldA', '首个错误应为 fieldA');
});

test('calculateProgress 正确计算进度', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name' },
    phone: { type: 'phone' }
  });
  var progress = validator.calculateProgress({ name: '张三', phone: '13800138000' });
  assertEqual(progress.total, 2, '总字段数应为2');
  assertEqual(progress.completed, 2, '完成数应为2');
  assertEqual(progress.percentage, 100, '进度应为100%');
});

test('getIncompleteByGroup 正确返回未完成项', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', group: 'basic' },
    email: {
      type: 'text',
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      group: 'contact'
    }
  });
  var incomplete = validator.getIncompleteByGroup({
    name: '张三',
    email: 'invalid-email'
  });
  assert(incomplete.contact, '应有 contact 分组');
  assert(incomplete.contact.count > 0, 'contact 组应有未完成项');
  var emailField = incomplete.contact.fields.find(function (f) { return f.field === 'email'; });
  assert(emailField !== undefined, '应包含 email 字段');
  assert(emailField.errors.length > 0, 'email 应有错误');
});

// ==============================================
// 第二部分：日期和金额严格校验（回归）
// ==============================================
console.log('');
console.log('--- 二、日期和金额严格校验 ---');

test('不存在的日期（2月30日）应被拦截', function () {
  var validator = new FormValidator();
  validator.registerField('date', { type: 'date' });
  var result = validator.validateField('date', '2024-02-30');
  assert(result.valid === false, '2月30日应不通过');
  assert(result.errors[0].rule === 'notExist', '应为 notExist 错误');
});

test('不存在的日期（13月）应被拦截', function () {
  var validator = new FormValidator();
  validator.registerField('date', { type: 'date' });
  var result = validator.validateField('date', '2024-13-01');
  assert(result.valid === false, '13月应不通过');
});

test('闰年2月29日应通过', function () {
  var validator = new FormValidator();
  validator.registerField('date', { type: 'date' });
  var result = validator.validateField('date', '2024-02-29');
  assert(result.valid === true, '闰年2月29日应通过');
});

test('金额包含空格应返回 hasSpace 错误', function () {
  var validator = new FormValidator();
  validator.registerField('amount', { type: 'amount' });
  var result = validator.validateField('amount', '100 00');
  assert(result.valid === false, '带空格的金额应不通过');
  var hasSpaceError = result.errors.find(function (e) { return e.rule === 'hasSpace'; });
  assert(hasSpaceError !== undefined, '应有 hasSpace 错误');
});

test('金额包含字母应返回 hasLetter 错误', function () {
  var validator = new FormValidator();
  validator.registerField('amount', { type: 'amount' });
  var result = validator.validateField('amount', '100a');
  assert(result.valid === false, '带字母的金额应不通过');
  var hasLetterError = result.errors.find(function (e) { return e.rule === 'hasLetter'; });
  assert(hasLetterError !== undefined, '应有 hasLetter 错误');
});

test('金额多个小数点应返回 multipleDots 错误', function () {
  var validator = new FormValidator();
  validator.registerField('amount', { type: 'amount' });
  var result = validator.validateField('amount', '12.34.56');
  assert(result.valid === false, '多小数点金额应不通过');
  var multipleDotsError = result.errors.find(function (e) { return e.rule === 'multipleDots'; });
  assert(multipleDotsError !== undefined, '应有 multipleDots 错误');
});

// ==============================================
// 第三部分：多步骤表单测试
// ==============================================
console.log('');
console.log('--- 三、多步骤表单 ---');

test('registerStep 可以注册步骤', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', {
    label: '基础信息',
    description: '填写基本资料',
    weight: 2
  });
  var step = validator.getStep('basic');
  assert(step !== null, '应能获取步骤');
  assertEqual(step.label, '基础信息', '标签应正确');
  assertEqual(step.description, '填写基本资料', '描述应正确');
  assertEqual(step.weight, 2, '权重应正确');
});

test('步骤包含字段', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', step: 'basic', stepLabel: '基础信息' },
    phone: { type: 'phone', step: 'basic' }
  });
  var step = validator.getStep('basic');
  assert(step !== null, '步骤应存在');
  assert(step.fields.indexOf('name') !== -1, '应包含 name 字段');
  assert(step.fields.indexOf('phone') !== -1, '应包含 phone 字段');
});

test('getAllSteps 返回所有步骤按顺序', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerStep('step3', { label: '步骤三' });
  var steps = validator.getAllSteps();
  assertEqual(steps.length, 3, '应有3个步骤');
  assertEqual(steps[0].name, 'step1', '第一个应为 step1');
  assertEqual(steps[2].name, 'step3', '第三个应为 step3');
});

test('setCurrentStep 设置当前步骤', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  var result = validator.setCurrentStep('step1');
  assert(result.success === true, '设置应成功');
  assertEqual(validator.getCurrentStep().name, 'step1', '当前步骤应为 step1');
  assertEqual(validator.getCurrentStep().status, FormValidator.STEP_STATUS.IN_PROGRESS, '状态应为进行中');
});

test('第一步未完成时不能跳到第二步', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerFields({
    name: { type: 'name', step: 'step1' }
  });
  validator.setCurrentStep('step1');
  var result = validator.goToStep('step2');
  assert(result.success === false, '不能跳到第二步');
  assert(result.reason, '应有原因说明');
});

test('validateStep 校验单个步骤', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', { label: '基础信息' });
  validator.registerFields({
    name: { type: 'name', step: 'basic' },
    phone: { type: 'phone', step: 'basic' }
  });
  validator.setValues({ name: '张三', phone: '13800138000' });
  var result = validator.validateStep('basic');
  assert(result.valid === true, '步骤校验应通过');
  assertEqual(result.step, 'basic', '步骤名应正确');
  assertEqual(result.errorCount, 0, '错误数应为0');
});

test('validateStep 检测步骤内错误', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', { label: '基础信息' });
  validator.registerFields({
    name: { type: 'name', step: 'basic' },
    phone: { type: 'phone', step: 'basic' }
  });
  validator.setValues({ name: '', phone: 'invalid' });
  var result = validator.validateStep('basic');
  assert(result.valid === false, '步骤校验应不通过');
  assert(result.errorCount > 0, '应有错误');
  assert(result.firstError !== null, '应有首个错误');
});

test('nextStep 自动校验并前进', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerFields({
    name: { type: 'name', step: 'step1' },
    address: { type: 'address', step: 'step2' }
  });
  validator.setValues({ name: '张三' });
  validator.setCurrentStep('step1');
  var result = validator.nextStep();
  assert(result.success === true, '应能进入下一步');
  assertEqual(validator.getCurrentStep().name, 'step2', '当前步骤应为 step2');
});

test('prevStep 回退到上一步', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerFields({
    name: { type: 'name', step: 'step1' },
    phone: { type: 'phone', step: 'step1' },
    address: { type: 'address', step: 'step2' }
  });
  validator.setValues({ name: '张三', phone: '13800138000', address: '' });
  validator.setCurrentStep('step1');
  validator.nextStep();
  var result = validator.prevStep();
  assert(result.success === true, '应能回退');
  assertEqual(validator.getCurrentStep().name, 'step1', '应回到 step1');
});

test('步骤状态为 locked 表示锁定', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerFields({
    name: { type: 'name', step: 'step1' }
  });
  validator.setCurrentStep('step1');
  var step2 = validator.getStep('step2');
  assertEqual(step2.status, FormValidator.STEP_STATUS.LOCKED, '第二步应为锁定状态');
});

test('getStepFields 获取步骤字段', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', { label: '基础' });
  validator.registerFields({
    name: { type: 'name', step: 'basic' },
    phone: { type: 'phone', step: 'basic' }
  });
  var fields = validator.getStepFields('basic');
  assertEqual(fields.length, 2, '应有2个字段');
  assert(fields.indexOf('name') !== -1, '包含 name');
  assert(fields.indexOf('phone') !== -1, '包含 phone');
});

test('步骤跳转保留字段值和错误状态', function () {
  var validator = new FormValidator();
  validator.registerStep('step1', { label: '步骤一' });
  validator.registerStep('step2', { label: '步骤二' });
  validator.registerFields({
    name: { type: 'name', step: 'step1' },
    phone: { type: 'phone', step: 'step1' },
    address: { type: 'address', step: 'step2' }
  });
  validator.setValues({ name: '张三', phone: '13800138000', address: '测试地址' });
  validator.validateAll();
  validator.setCurrentStep('step1');
  validator.nextStep();
  assertEqual(validator.fieldValues.name, '张三', 'name 值应保留');
  assertEqual(validator.fieldValues.address, '测试地址', 'address 值应保留');
  assert(validator.getFieldStatus('name') === FormValidator.VALIDATE_STATUS.SUCCESS, '校验状态应保留');
});

// ==============================================
// 第四部分：字段联动和派生值
// ==============================================
console.log('');
console.log('--- 四、字段联动和派生值 ---');

test('updateFieldOptions 动态更新选项', function () {
  var validator = new FormValidator();
  validator.registerField('city', {
    type: 'text',
    required: true,
    options: ['北京', '上海']
  });
  validator.updateFieldOptions('city', ['北京', '上海', '广州', '深圳']);
  var meta = validator.getFieldMeta('city');
  assert(meta !== null, '应能获取元数据');
  assertEqual(meta.options.length, 4, '选项数应为4');
  assert(meta.options.indexOf('深圳') !== -1, '应包含深圳');
});

test('updateFieldLabel 动态更新标签', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  validator.updateFieldLabel('name', '真实姓名');
  var meta = validator.getFieldMeta('name');
  assertEqual(meta.label, '真实姓名', '标签应更新');
});

test('setFieldDisabled 设置禁用状态', function () {
  var validator = new FormValidator();
  validator.registerField('remark', { type: 'text', required: true });
  validator.setFieldDisabled('remark', true);
  var result = validator.validateField('remark', '');
  assert(result.valid === true, '禁用字段应通过校验');
  assert(result.disabled === true, '应标记为 disabled');
});

test('dependsOn 声明依赖关系', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: true },
    city: {
      type: 'text',
      required: true,
      dependsOn: ['province']
    }
  });
  assert(validator._dependencies.province !== undefined, '应建立依赖映射');
  assert(validator._dependencies.province.indexOf('city') !== -1, 'city 依赖 province');
});

test('setFieldValue 触发 onChange 回调', function (done) {
  var changeCount = 0;
  var validator = new FormValidator({
    onFieldChange: function (info) {
      changeCount++;
    }
  });
  validator.registerField('name', { type: 'name', changeDebounce: 10 });
  validator.setFieldValue('name', '张三');
  setTimeout(function () {
    assert(changeCount > 0, '应触发 onChange 回调');
    done();
  }, 100);
});

test('setValues 批量设置值', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name' },
    phone: { type: 'phone' }
  });
  validator.setValues({ name: '李四', phone: '13900139000' });
  assertEqual(validator.fieldValues.name, '李四', 'name 应正确');
  assertEqual(validator.fieldValues.phone, '13900139000', 'phone 应正确');
});

// ==============================================
// 第五部分：校验结果报表
// ==============================================
console.log('');
console.log('--- 五、校验结果报表 ---');

test('getValidationReport 返回完整报表', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', group: 'basic', step: 'basic' },
    phone: { type: 'phone', group: 'basic', step: 'basic' },
    address: { type: 'address', group: 'contact', step: 'address' }
  });
  validator.setValues({ name: '张三', phone: '', address: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.summary !== undefined, '应有 summary');
  assert(report.bySeverity !== undefined, '应有 bySeverity');
  assert(report.byGroup !== undefined, '应有 byGroup');
  assert(report.byStep !== undefined, '应有 byStep');
  assert(report.priorities !== undefined, '应有 priorities');
  assert(report.suggestions !== undefined, '应有 suggestions');
});

test('报表 summary 统计正确', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name' },
    phone: { type: 'phone' }
  });
  validator.setValues({ name: '', phone: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.summary.valid === false, 'valid 应为 false');
  assertEqual(report.summary.totalFields, 2, '总字段数应为2');
  assert(report.summary.errorCount >= 2, '错误数应>=2');
});

test('报表 bySeverity 按严重级别分组', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', severity: 'error' },
    phone: { type: 'phone', severity: 'warning' }
  });
  validator.setValues({ name: '', phone: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(Array.isArray(report.bySeverity.error), 'error 应为数组');
  assert(Array.isArray(report.bySeverity.warning), 'warning 应为数组');
  assert(report.bySeverity.error.length > 0, '应有 error 级错误');
});

test('报表 byGroup 按分组整理', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', group: 'basic' },
    phone: { type: 'phone', group: 'basic' }
  });
  validator.setValues({ name: '', phone: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.byGroup.basic !== undefined, '应有 basic 分组');
  assert(report.byGroup.basic.errorCount > 0, 'basic 组应有错误');
  assert(report.byGroup.basic.firstError !== null, '应有首个错误');
});

test('报表 byStep 按步骤整理含先改建议', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', { label: '基础信息' });
  validator.registerFields({
    name: { type: 'name', step: 'basic' },
    phone: { type: 'phone', step: 'basic' }
  });
  validator.setValues({ name: '', phone: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.byStep.basic !== undefined, '应有 basic 步骤');
  assertEqual(report.byStep.basic.label, '基础信息', '标签应正确');
  assert(report.byStep.basic.errorCount > 0, '应有错误');
  assert(report.byStep.basic.firstAction !== undefined, '应有先改建议');
});

test('报表 priorities 按优先级排序', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name', severity: 'error' },
    remark: { type: 'text', required: false, severity: 'warning' }
  });
  validator.setValues({ name: '', remark: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.priorities.length > 0, '应有优先级列表');
  assertEqual(report.priorities[0].severity, 'error', '第一个应为 error 级');
});

test('报表 suggestions 包含修正建议', function () {
  var validator = new FormValidator();
  validator.registerFields({
    name: { type: 'name' }
  });
  validator.setValues({ name: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.suggestions.length > 0, '应有建议列表');
  assert(report.suggestions[0].suggestion !== undefined, '每个建议应有 suggestion 文本');
});

test('报表 priorities 包含 action 行动指引', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  validator.setValues({ name: '' });
  validator.validateAll();
  var report = validator.getValidationReport();
  assert(report.priorities.length > 0, '应有优先级项');
  assert(report.priorities[0].action !== undefined, '应有行动指引');
  assert(typeof report.priorities[0].action === 'string', '行动指引应为字符串');
});

// ==============================================
// 第六部分：Schema 导出导入和版本管理
// ==============================================
console.log('');
console.log('--- 六、Schema 导出导入和版本管理 ---');

test('exportSchema 导出版本号和创建时间', function () {
  var validator = new FormValidator();
  validator.registerFields({ name: { type: 'name' } });
  var schema = validator.exportSchema();
  assert(schema.schemaVersion !== undefined, '应有 schemaVersion');
  assert(schema.createdAt !== undefined, '应有 createdAt');
  assertEqual(schema.schemaVersion, FormValidator.SCHEMA_VERSION, '版本号应匹配');
});

test('exportSchema 包含 appVersion 和变更说明', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var schema = validator.exportSchema({
    appVersion: '1.2.3',
    changeDescription: '新增手机号字段'
  });
  assertEqual(schema.appVersion, '1.2.3', 'appVersion 应正确');
  assertEqual(schema.changeDescription, '新增手机号字段', '变更说明应正确');
});

test('exportSchema 包含步骤配置', function () {
  var validator = new FormValidator();
  validator.registerStep('basic', { label: '基础信息' });
  validator.registerFields({
    name: { type: 'name', step: 'basic' },
    phone: { type: 'phone', step: 'basic' }
  });
  var schema = validator.exportSchema();
  assert(schema.steps !== undefined, '应有 steps');
  assert(schema.stepOrder !== undefined, '应有 stepOrder');
  assert(schema.steps.basic !== undefined, '应有 basic 步骤');
  assertEqual(schema.stepOrder.length, 1, '步骤顺序应有1项');
});

test('exportSchema 包含依赖关系', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: true },
    city: { type: 'text', required: true, dependsOn: ['province'] }
  });
  var schema = validator.exportSchema();
  assert(schema.dependencies !== undefined, '应有 dependencies');
  assert(schema.dependencies.province !== undefined, 'province 应有依赖列表');
  assert(schema.dependencies.province.indexOf('city') !== -1, 'city 依赖 province');
});

test('importSchema 恢复字段和分组配置', function () {
  var validator1 = new FormValidator();
  validator1.registerFields({
    name: { type: 'name', group: 'basic' },
    phone: { type: 'phone', group: 'basic' }
  });
  var schema = validator1.exportSchema();
  var validator2 = new FormValidator();
  validator2.importSchema(schema);
  assert(validator2.fields.name !== undefined, '应恢复 name 字段');
  assert(validator2.fields.phone !== undefined, '应恢复 phone 字段');
  assert(validator2.groups.basic !== undefined, '应恢复 basic 分组');
  assertEqual(validator2.fields.name.type, 'name', '类型应正确');
});

test('importSchema 恢复步骤配置', function () {
  var validator1 = new FormValidator();
  validator1.registerStep('basic', { label: '基础信息' });
  validator1.registerFields({
    name: { type: 'name', step: 'basic' }
  });
  var schema = validator1.exportSchema();
  var validator2 = new FormValidator();
  validator2.importSchema(schema);
  assert(validator2.steps.basic !== undefined, '应恢复步骤');
  assertEqual(validator2.steps.basic.label, '基础信息', '步骤标签应正确');
  assert(validator2.stepOrder.indexOf('basic') !== -1, '步骤顺序应恢复');
});

test('importSchema RegExp 正确恢复', function () {
  var validator1 = new FormValidator();
  validator1.registerField('email', {
    type: 'text',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  });
  var schema = validator1.exportSchema();
  var schemaJson = JSON.stringify(schema);
  var restoredSchema = JSON.parse(schemaJson);
  var validator2 = new FormValidator();
  validator2.importSchema(restoredSchema);
  assert(validator2.fields.email.pattern instanceof RegExp, 'pattern 应恢复为 RegExp');
  assert(validator2.fields.email.pattern.test('a@b.com') === true, '正则应能匹配');
  assert(validator2.fields.email.pattern.test('invalid') === false, '正则应能排除无效值');
});

test('importSchema strict 模式下不兼容版本抛错', function () {
  var validator = new FormValidator();
  var badSchema = { schemaVersion: '3.0.0', fields: {} };
  var threw = false;
  try {
    validator.importSchema(badSchema, { strict: true });
  } catch (e) {
    threw = true;
  }
  assert(threw === true, '严格模式下不兼容版本应抛错');
});

test('importSchema 非 strict 模式下兼容主版本相同的版本', function () {
  var validator1 = new FormValidator();
  validator1.registerField('name', { type: 'name' });
  var schema = validator1.exportSchema();
  schema.schemaVersion = '2.1.0';
  var validator2 = new FormValidator();
  var threw = false;
  try {
    validator2.importSchema(schema);
  } catch (e) {
    threw = true;
  }
  assert(threw === false, '次版本不同应兼容');
  assert(validator2.fields.name !== undefined, '字段应正常导入');
});

test('addSchemaChangeLog 添加变更日志', function () {
  var validator = new FormValidator();
  validator.addSchemaChangeLog('1.0.0', '初始版本', '创建基础字段');
  validator.addSchemaChangeLog('1.1.0', '新增地址校验', '添加地址字段');
  var logs = validator.getSchemaChangeLog();
  assertEqual(logs.length, 2, '应有2条日志');
  assertEqual(logs[0].version, '1.0.0', '第一条版本应为1.0.0');
  assertEqual(logs[1].description, '新增地址校验', '第二条描述应正确');
});

test('exportSchema 包含 customRules 列表', function () {
  var validator = new FormValidator();
  validator.registerCustomRule('idCard', function (v) { return true; }, '身份证格式不正确');
  var schema = validator.exportSchema();
  assert(Array.isArray(schema.customRules), 'customRules 应为数组');
  assert(schema.customRules.length > 0, '应有自定义规则');
  assertEqual(schema.customRules[0].name, 'idCard', '规则名应正确');
});

// ==============================================
// 第七部分：异步校验（回归验证）
// ==============================================
console.log('');
console.log('--- 七、异步校验回归测试 ---');

test('validateFieldAsync 返回 Promise', function (done) {
  var validator = new FormValidator();
  validator.registerField('phone', {
    type: 'phone',
    asyncValidator: function (value) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(true); }, 50);
      });
    }
  });
  var result = validator.validateFieldAsync('phone', '13800138000');
  assert(result && typeof result.then === 'function', '应返回 Promise');
  result.then(function (res) {
    assert(res.valid === true, '异步校验应通过');
    assert(res.async === true, '应标记为 async');
    done();
  });
});

test('异步校验失败返回错误', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    debounce: 10,
    asyncValidator: function (value) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(false); }, 50);
      });
    },
    message: { async: '该手机号已注册' }
  });
  validator.validateFieldAsync('phone', '13800138000').then(function (res) {
    assert(res.valid === false, '异步校验应不通过');
    assert(res.errors.length > 0, '应有错误');
    assert(res.errors[0].rule === 'async', '规则应为 async');
    done();
  });
});

// ==============================================
// 测试统计
// ==============================================
console.log('');
console.log('======================================');
console.log('测试完成: 共 ' + totalTests + ' 项, 通过: ' + passedTests + ' 项, 失败: ' + failedTests.length + ' 项');
console.log('======================================');

if (failedTests.length > 0) {
  console.log('');
  console.log('失败的测试:');
  for (var i = 0; i < failedTests.length; i++) {
    console.log('  ' + (i + 1) + '. ' + failedTests[i].name + ': ' + failedTests[i].error);
  }
}

console.log('');

process.exit(failedTests.length > 0 ? 1 : 0);
