var FormValidator = require('./form-validator.js');

console.log('========== FormValidator 测试 ==========\n');

var passed = 0;
var failed = 0;
var failedTests = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('PASS: ' + message);
  } else {
    failed++;
    failedTests.push(message);
    console.log('FAIL: ' + message);
  }
}

function assertEqual(actual, expected, message) {
  var isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  assert(isEqual, message + ' (期望: ' + JSON.stringify(expected) + ', 实际: ' + JSON.stringify(actual) + ')');
}

console.log('--- 1. 基础初始化测试 ---');
var validator = new FormValidator();
assert(validator !== null, 'FormValidator 实例化成功');
assert(typeof validator.registerField === 'function', 'registerField 方法存在');
assert(typeof validator.validateField === 'function', 'validateField 方法存在');
assert(typeof validator.validateAll === 'function', 'validateAll 方法存在');

console.log('\n--- 2. 内置规则测试：姓名 ---');
validator.registerField('username', { type: 'name' });
var nameResult = validator.validateField('username', '张三');
assert(nameResult.valid === true, '正确姓名校验通过');
assert(nameResult.errors.length === 0, '正确姓名无错误');

var nameResult2 = validator.validateField('username', '');
assert(nameResult2.valid === false, '空姓名校验不通过');
assert(nameResult2.errors.length === 1, '空姓名有1个错误');
assert(nameResult2.errors[0].rule === 'required', '错误类型为 required');
assert(nameResult2.errors[0].severity === 'error', '严重级别为 error');

var nameResult3 = validator.validateField('username', '张');
assert(nameResult3.valid === false, '太短姓名校验不通过');
assert(nameResult3.errors[0].rule === 'minLength', '错误类型为 minLength');

var nameResult4 = validator.validateField('username', '12345');
assert(nameResult4.valid === false, '含数字姓名校验不通过');
assert(nameResult4.errors[0].rule === 'pattern', '错误类型为 pattern');

console.log('\n--- 3. 内置规则测试：手机号 ---');
validator.registerField('phone', { type: 'phone' });
var phoneResult = validator.validateField('phone', '13800138000');
assert(phoneResult.valid === true, '正确手机号校验通过');

var phoneResult2 = validator.validateField('phone', '12345');
assert(phoneResult2.valid === false, '错误手机号校验不通过');
assert(phoneResult2.errors[0].rule === 'pattern', '错误类型为 pattern');

console.log('\n--- 4. 内置规则测试：日期 ---');
validator.registerField('birthday', { type: 'date' });
var dateResult = validator.validateField('birthday', '2024-01-15');
assert(dateResult.valid === true, '正确日期校验通过');

var dateResult2 = validator.validateField('birthday', '2024/01/15');
assert(dateResult2.valid === false, '格式错误日期校验不通过');
assert(dateResult2.errors[0].rule === 'format', '错误类型为 format');

console.log('\n--- 5. 内置规则测试：金额 ---');
validator.registerField('amount', { type: 'amount' });
var amountResult = validator.validateField('amount', '99.99');
assert(amountResult.valid === true, '正确金额校验通过');

var amountResult2 = validator.validateField('amount', '-10');
assert(amountResult2.valid === false, '负金额校验不通过');
assert(amountResult2.errors[0].rule === 'min', '错误类型为 min');

var amountResult3 = validator.validateField('amount', '99.999');
assert(amountResult3.valid === false, '三位小数金额校验不通过');
assert(amountResult3.errors[0].rule === 'precision', '错误类型为 precision');

console.log('\n--- 6. 内置规则测试：地址 ---');
validator.registerField('address', { type: 'address' });
var addrResult = validator.validateField('address', '北京市朝阳区某某街道');
assert(addrResult.valid === true, '正确地址校验通过');

var addrResult2 = validator.validateField('address', '北京');
assert(addrResult2.valid === false, '太短地址校验不通过');
assert(addrResult2.errors[0].rule === 'minLength', '错误类型为 minLength');

console.log('\n--- 7. 内置规则测试：多选项 ---');
validator.registerField('hobbies', {
  type: 'multiSelect',
  minCount: 1,
  maxCount: 3,
  options: ['reading', 'music', 'sports', 'coding']
});
var multiResult = validator.validateField('hobbies', ['reading', 'music']);
assert(multiResult.valid === true, '正确多选校验通过');

var multiResult2 = validator.validateField('hobbies', []);
assert(multiResult2.valid === false, '空多选校验不通过');
assert(multiResult2.errors[0].rule === 'minCount', '错误类型为 minCount');

var multiResult3 = validator.validateField('hobbies', ['reading', 'music', 'sports', 'coding']);
assert(multiResult3.valid === false, '超量多选校验不通过');
assert(multiResult3.errors[0].rule === 'maxCount', '错误类型为 maxCount');

console.log('\n--- 8. 自定义提示文案测试 ---');
validator.registerField('customName', {
  type: 'name',
  message: {
    required: '名字不能为空哦~',
    minLength: '名字太短啦，至少{minLength}个字'
  }
});
var customResult = validator.validateField('customName', '');
assert(customResult.errors[0].message === '名字不能为空哦~', '自定义 required 提示生效');

var customResult2 = validator.validateField('customName', '张');
assert(customResult2.errors[0].message === '名字太短啦，至少2个字', '自定义 minLength 提示生效，支持占位符');

console.log('\n--- 9. 严重级别测试 ---');
validator.registerField('warningField', {
  type: 'name',
  severity: 'warning',
  required: false,
  minLength: 5
});
var warnResult = validator.validateField('warningField', 'abc');
assert(warnResult.warnings.length > 0, 'warning 级别错误进入 warnings');
assert(warnResult.errors.length === 0, 'warning 级别错误不进入 errors');
assert(warnResult.valid === true, 'warning 不影响 valid 结果');

console.log('\n--- 10. 提交前统一检查测试 ---');
var submitValidator = new FormValidator();
submitValidator.registerFields({
  name: { type: 'name', group: 'basic' },
  phone: { type: 'phone', group: 'basic' },
  address: { type: 'address', group: 'contact' },
  email: {
    type: 'text',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: { pattern: '请输入正确的邮箱地址' },
    group: 'contact'
  }
});

var allValues = {
  name: '张三',
  phone: '13800138000',
  address: '',
  email: ''
};
var summary = submitValidator.validateAll(allValues);
assert(summary.valid === false, '有必填项为空时整体不通过');
assert(summary.errorCount >= 2, '至少有2个错误');
assert(summary.firstError !== null, '存在首个错误');
assert(summary.firstError.field === 'address', '首个错误字段正确（按注册顺序）');
assert(summary.totalFields === 4, '校验了4个字段');

console.log('\n--- 11. 填写进度计算测试 ---');
var progress = submitValidator.calculateProgress({
  name: '张三',
  phone: '13800138000',
  address: '北京市朝阳区',
  email: 'test@example.com'
});
assert(progress.percentage === 100, '全部填写完成时进度为100%');
assert(progress.total === 4, '总共有4个字段');
assert(progress.completed === 4, '完成了4个字段');

var progress2 = submitValidator.calculateProgress({
  name: '张三',
  phone: '',
  address: '',
  email: ''
});
assert(progress2.percentage === 25, '完成1个字段时进度为25%');

console.log('\n--- 12. 分组统计未完成项测试 ---');
var incomplete = submitValidator.getIncompleteByGroup({
  name: '张三',
  phone: '',
  address: '',
  email: 'invalid-email'
});
assert(incomplete.basic !== undefined, 'basic 分组存在');
assert(incomplete.contact !== undefined, 'contact 分组存在');
assert(incomplete.basic.count === 1, 'basic 分组有1个未完成项');
assert(incomplete.contact.count === 2, 'contact 分组有2个未完成项');

console.log('\n--- 13. 分组进度测试 ---');
var groupProgress = submitValidator.getGroupProgress('basic', {
  name: '张三',
  phone: '13800138000'
});
assert(groupProgress.percentage === 100, 'basic 分组完成度 100%');

console.log('\n--- 14. 条件显示判断测试 ---');
var condValidator = new FormValidator();
condValidator.registerFields({
  hasAddress: { type: 'text' },
  address: {
    type: 'address',
    visibleWhen: { hasAddress: 'yes' }
  },
  city: {
    type: 'text',
    required: true,
    visibleWhen: function (values) {
      return values.address && values.address.length > 0;
    }
  }
});

var visibleResult = condValidator.isFieldVisible('address', { hasAddress: 'yes' });
assert(visibleResult === true, '对象形式条件显示判断 - 显示');

var visibleResult2 = condValidator.isFieldVisible('address', { hasAddress: 'no' });
assert(visibleResult2 === false, '对象形式条件显示判断 - 隐藏');

var visibleResult3 = condValidator.isFieldVisible('city', { address: '北京市' });
assert(visibleResult3 === true, '函数形式条件显示判断 - 显示');

var condSummary = condValidator.validateAll({ hasAddress: 'no', address: '' });
assert(condSummary.totalFields === 1, '隐藏字段不参与校验（只校验可见字段）');

console.log('\n--- 15. 重复值检测测试 ---');
var dupValidator = new FormValidator();
dupValidator.registerFields({
  email1: { type: 'text', unique: true },
  email2: { type: 'text', unique: true },
  email3: { type: 'text' }
});

var dupResult = dupValidator.validateAll({
  email1: 'test@example.com',
  email2: 'test@example.com',
  email3: 'test@example.com'
});
assert(dupResult.errors.length >= 2, '重复值检测触发，至少2个错误');
assert(dupResult.errors[0].rule === 'unique', '错误类型为 unique');

console.log('\n--- 16. 自定义校验规则测试 ---');
var customValidator = new FormValidator();
customValidator.registerCustomRule('strongPassword', function (value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
}, '密码需包含大小写字母和数字，至少8位');

customValidator.registerField('password', {
  type: 'text',
  required: true,
  customRules: ['strongPassword']
});

var pwdResult = customValidator.validateField('password', 'abc');
assert(pwdResult.valid === false, '自定义规则 - 弱密码不通过');
assert(pwdResult.errors.length === 1, '有1个错误（custom rule）');
assert(pwdResult.errors[0].rule === 'strongPassword', '错误类型为自定义规则 strongPassword');

var pwdResult2 = customValidator.validateField('password', 'Abc12345');
assert(pwdResult2.valid === true, '自定义规则 - 强密码通过');

console.log('\n--- 17. 自定义校验函数测试 ---');
var fnValidator = new FormValidator();
fnValidator.registerField('confirmPassword', {
  type: 'text',
  required: true,
  validator: function (value, allValues) {
    if (value !== allValues.password) {
      return { valid: false, message: '两次密码输入不一致' };
    }
    return true;
  }
});
fnValidator.setFieldValue('password', '123456');
var confirmResult = fnValidator.validateField('confirmPassword', '1234567');
assert(confirmResult.valid === false, '自定义校验函数 - 不一致不通过');
assert(confirmResult.errors[0].message === '两次密码输入不一致', '自定义错误消息正确');

console.log('\n--- 18. 错误信息格式化测试 ---');
var fmtValidator = new FormValidator();
fmtValidator.registerField('username', { type: 'name', label: '用户姓名' });
fmtValidator.validateField('username', '');
var fmtMsg = fmtValidator.formatErrorMessage(fmtValidator.getFirstError());
assert(fmtMsg.indexOf('[用户姓名]') === 0, '格式化错误包含标签名');
assert(fmtMsg.indexOf('请输入姓名') > -1, '格式化错误包含错误消息');

var fmtAll = fmtValidator.formatAllErrors('; ');
assert(typeof fmtAll === 'string', '批量格式化返回字符串');

console.log('\n--- 19. 修正建议生成测试 ---');
var sugValidator = new FormValidator();
sugValidator.registerField('name', { type: 'name' });
sugValidator.registerField('phone', { type: 'phone' });
sugValidator.validateAll({ name: '', phone: '123' });
var suggestions = sugValidator.generateSuggestions();
assert(suggestions.length >= 2, '生成了至少2条建议');
assert(suggestions[0].suggestion !== undefined, '建议包含 suggestion 字段');
assert(suggestions[0].label !== undefined, '建议包含 label 字段');

console.log('\n--- 20. 批量清空状态测试 ---');
var clearValidator = new FormValidator();
clearValidator.registerField('a', { type: 'name' });
clearValidator.registerField('b', { type: 'phone' });
clearValidator.validateAll({ a: '', b: '' });
assert(clearValidator.getAllErrors().length >= 2, '清空前有错误');

clearValidator.clearAllStatus();
assert(clearValidator.getAllErrors().length === 0, '清空后无错误');
assert(clearValidator.getAllWarnings().length === 0, '清空后无警告');

console.log('\n--- 21. 字段权重测试 ---');
var weightValidator = new FormValidator();
weightValidator.registerFields({
  name: { type: 'name', weight: 2 },
  phone: { type: 'phone', weight: 3 },
  email: { type: 'text', weight: 1 }
});
var weightProgress = weightValidator.calculateProgress({
  name: '张三',
  phone: '',
  email: ''
});
assert(weightProgress.total === 6, '权重总和为6');
assert(weightProgress.completed === 2, '已完成权重为2');
assert(weightProgress.percentage === 33, '进度为33% (2/6 ≈ 33%)');

console.log('\n--- 22. 链式调用测试 ---');
var chainValidator = new FormValidator();
var chainResult = chainValidator
  .registerField('a', { type: 'name' })
  .registerField('b', { type: 'phone' })
  .setFieldValue('a', '张三')
  .setFieldValue('b', '13800138000')
  .clearAllStatus();
assert(chainResult !== undefined, '链式调用返回实例');

console.log('\n--- 23. 最近一次校验摘要测试 ---');
var summaryValidator = new FormValidator({ enableSummaryPersistence: false });
summaryValidator.registerField('test', { type: 'name' });
summaryValidator.validateAll({ test: '' });
var lastSummary = summaryValidator.getLastSummary();
assert(lastSummary !== null, '最近一次摘要不为空');
assert(lastSummary.valid === false, '摘要记录了校验结果');
assert(lastSummary.timestamp !== undefined, '摘要包含时间戳');
assert(lastSummary.errorCount >= 1, '摘要记录了错误数量');

console.log('\n--- 24. getAllGroups / getFieldsByGroup 测试 ---');
var groupValidator = new FormValidator();
groupValidator.registerFields({
  a: { type: 'name', group: 'g1' },
  b: { type: 'phone', group: 'g1' },
  c: { type: 'address', group: 'g2' }
});
var allGroups = groupValidator.getAllGroups();
assert(allGroups.length === 2, '共有2个分组');
assert(allGroups.indexOf('g1') > -1, '包含 g1 分组');

var g1Fields = groupValidator.getFieldsByGroup('g1');
assert(g1Fields.length === 2, 'g1 分组有2个字段');

console.log('\n--- 25. setValues 批量设值测试 ---');
var setValsValidator = new FormValidator();
setValsValidator.registerFields({
  name: { type: 'name' },
  phone: { type: 'phone' }
});
setValsValidator.setValues({ name: '李四', phone: '13900139000' });
assert(setValsValidator.fieldValues.name === '李四', '批量设值 - name 正确');
assert(setValsValidator.fieldValues.phone === '13900139000', '批量设值 - phone 正确');

console.log('\n--- 26. reset 重置测试 ---');
var resetValidator = new FormValidator();
resetValidator.registerField('x', { type: 'name' });
resetValidator.setFieldValue('x', 'test');
resetValidator.validateField('x', 'test');
assert(Object.keys(resetValidator.fields).length === 1, '重置前有字段');
resetValidator.reset();
assert(Object.keys(resetValidator.fields).length === 0, '重置后无字段');
assert(resetValidator.lastSummary === null, '重置后无摘要');

console.log('\n======================================');
console.log('测试完成: 共 ' + (passed + failed) + ' 项');
console.log('通过: ' + passed + ' 项');
console.log('失败: ' + failed + ' 项');
console.log('======================================');

if (failedTests.length > 0) {
  console.log('\n失败的测试:');
  for (var i = 0; i < failedTests.length; i++) {
    console.log('  ' + (i + 1) + '. ' + failedTests[i]);
  }
  console.log('');
}

if (failed > 0) {
  process.exit(1);
}
