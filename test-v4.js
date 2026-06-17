var FormValidator = require('./form-validator.js');

var totalTests = 0;
var passedTests = 0;
var failedTests = [];

function test(name, fn) {
  totalTests++;
  try {
    if (typeof FormValidator.clearGlobalStorage === 'function') {
      FormValidator.clearGlobalStorage();
    }
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

console.log('=== 智能表单校验类库 V4 增强测试 ===\n');

console.log('--- 一、自定义规则快照回放一致性 ---');

test('saveDraft 应包含 customRules', function () {
  var validator = new FormValidator();
  validator.registerCustomRule('strongPassword', function (value) {
    return value && value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
  }, '密码需至少8位包含大写字母和数字');
  validator.registerField('pwd', { type: 'text', required: true, label: '密码', customRules: ['strongPassword'] });
  var saved = validator.saveDraft({ name: '含自定义规则' });
  assert(saved && saved.id, '应返回草稿ID');
  var d = validator.getDraft(saved.id);
  assert(d.schema.customRules !== undefined, '草稿 schema 应包含 customRules');
  assert(d.schema.customRules.strongPassword !== undefined, '应包含 strongPassword 规则');
  assert(typeof d.schema.customRules.strongPassword.validator === 'function', '规则 validator 应为函数');
});

test('previewDraft 自定义规则应生效', function () {
  var validator = new FormValidator();
  validator.registerCustomRule('strongPassword', function (value) {
    return value && value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
  }, '密码强度不足');
  validator.registerField('pwd', { type: 'text', required: true, label: '密码', customRules: ['strongPassword'] });
  var saved = validator.saveDraft({ name: '自定义规则草稿' });
  var preview = validator.previewDraft(saved.id, { pwd: 'abc' });
  assert(preview.syncResult && preview.syncResult.fieldResults.pwd, '应返回密码字段校验结果');
  assert(preview.syncResult.fieldResults.pwd.errors.length > 0, '弱密码应触发自定义规则错误');
  var hasCustomErr = preview.syncResult.fieldResults.pwd.errors.some(function (e) {
    return e.rule === 'strongPassword';
  });
  assert(hasCustomErr, '错误中应包含 strongPassword 规则');
});

test('loadPublishedVersion 自定义规则应生效', function () {
  var v1 = new FormValidator();
  v1.registerCustomRule('idCard', function (value) {
    return value && /^\d{17}[\dXx]$/.test(value);
  }, '身份证号格式不正确');
  v1.registerField('id', { type: 'text', required: true, label: '身份证', customRules: ['idCard'] });
  var s = v1.saveDraft({ name: '身份证草稿' });
  v1.publishDraft(s.id, { version: '4.0.0' });

  var v2 = new FormValidator();
  v2.loadPublishedVersion('4.0.0');
  assert(v2.customRules.idCard !== undefined, '加载后实例应有 idCard 规则');
  assert(typeof v2.customRules.idCard.validator === 'function', 'validator 函数应保留');
  var result = v2.validateField('id', '123');
  var hasIdCardErr = result.errors.some(function (e) { return e.rule === 'idCard'; });
  assert(hasIdCardErr, '加载后身份证规则应生效');
});

console.log('\n--- 二、同步+异步错误摘要完整 ---');

test('validateAllAsync 无异步字段时同步错误进摘要', function () {
  var validator = new FormValidator();
  validator.registerField('username', { type: 'text', required: true, label: '用户名' });
  var summary = validator.validateAll({ username: '' });
  assert(summary.valid === false, '校验应失败');
  assert(summary.errorCount >= 1, 'errorCount 应包含错误');
  assert(summary.firstError !== null, 'firstError 应存在');
});

test('同步+异步错误并存时 errorCount/firstError 都正确', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name', required: true, label: '姓名' });
  validator.registerField('addr', {
    type: 'address', required: true, label: '地址',
    asyncValidator: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ valid: false, errors: [{ rule: 'addr_unsupported', message: '地址不可配送' }] });
        }, 10);
      });
    }
  });
  var syncSummary = validator.validateAll({ name: '', addr: 'xxx' });
  assert(syncSummary.errors.length >= 1, '同步至少有1条错误');
  assert(syncSummary.firstError !== null, '同步 firstError 存在');
});

console.log('\n--- 三、版本差异对比 ---');

test('diffVersions 对比两个已发布版本', function () {
  var v = new FormValidator();
  v.registerField('name', { type: 'name', required: true, label: '姓名' });
  var d1 = v.saveDraft({ name: 'v1' });
  v.publishDraft(d1.id, { version: '4.1.0' });

  v.registerField('phone', { type: 'phone', required: true, label: '电话', message: { required: '请填写联系电话' } });
  v.registerField('name', { type: 'name', required: true, label: '用户姓名' });
  var d2 = v.saveDraft({ name: 'v2' });
  v.publishDraft(d2.id, { version: '4.2.0' });

  var diff = v.diffVersions('4.1.0', '4.2.0');
  assertEqual(diff.from, '4.1.0', '源版本');
  assertEqual(diff.to, '4.2.0', '目标版本');
  assert(diff.addedFields.indexOf('phone') !== -1, 'phone 为新增字段');
  assert(diff.summary.addedFields >= 1, '新增字段数统计');
  assert(diff.fieldChanges.name !== undefined, 'name 有变更');
  assert(diff.fieldChanges.name.labelChanged === true, 'name label 变更');
  assert(diff.messageChanges.phone !== undefined, 'phone message 有变化');
});

test('diffVersions 联动关系变更检测', function () {
  var v = new FormValidator();
  v.registerField('province', { type: 'text', label: '省份' });
  var d1 = v.saveDraft({ name: 'l1' });
  v.publishDraft(d1.id, { version: '4.3.0' });

  v.registerField('city', {
    type: 'text', label: '城市', dependsOn: ['province'],
    deriveOptions: function (vals) { return vals.province ? ['A'] : []; }
  });
  var d2 = v.saveDraft({ name: 'l2' });
  v.publishDraft(d2.id, { version: '4.4.0' });

  var diff = v.diffVersions('4.3.0', '4.4.0');
  assert(diff.addedFields.indexOf('city') !== -1, 'city 为新增');
  assert(diff.linkageChanges.city !== undefined, 'city 有联动配置');
  assert(diff.linkageChanges.city.hasDeriveOptions === true, '应有 deriveOptions');
});

test('diffVersions 支持 current 对比当前实例', function () {
  var v = new FormValidator();
  v.registerField('a', { type: 'text', required: true, label: 'A' });
  var d1 = v.saveDraft({ name: 'cv' });
  v.publishDraft(d1.id, { version: '4.5.0' });
  v.registerField('b', { type: 'text', required: true, label: 'B' });
  var diff = v.diffVersions('4.5.0', 'current');
  assert(diff.addedFields.indexOf('b') !== -1, 'current 中 b 为新增');
});

console.log('\n--- 四、版本回滚与回滚记录 ---');

test('rollbackToVersion 回滚到旧版本', function () {
  var v = new FormValidator();
  v.registerField('name', { type: 'name', required: true, label: '姓名' });
  var d1 = v.saveDraft({ name: 'rb1' });
  v.publishDraft(d1.id, { version: '4.6.0' });

  v.registerField('email', { type: 'text', required: true, label: '邮箱' });
  assert(v.fields.email !== undefined, '回滚前应有 email 字段');
  var rb = v.rollbackToVersion('4.6.0', { fromVersion: 'working', description: '移除邮箱字段' });
  assertEqual(rb.toVersion, '4.6.0', '回滚目标版本');
  assert(v.fields.email === undefined, '回滚后不应有 email 字段');
  assert(v.fields.name !== undefined, '回滚后应有 name 字段');
});

test('getRollbackHistory 获取回滚记录', function () {
  var v = new FormValidator();
  v.registerField('x', { type: 'text', label: 'X' });
  var d = v.saveDraft();
  v.publishDraft(d.id, { version: '4.7.0' });
  v.registerField('y', { type: 'text', label: 'Y' });
  v.rollbackToVersion('4.7.0');
  var history = v.getRollbackHistory();
  assert(Array.isArray(history), 'history 应为数组');
  assert(history.length >= 1, '应有至少1条回滚记录');
  assertEqual(history[0].toVersion, '4.7.0', '最新的回滚目标版本');
  assert(history[0].rolledBackAt !== undefined, '应有时间戳');
});

console.log('\n--- 五、运行监控统计 ---');

test('getMonitoringStats 统计字段高频错误', function () {
  var v = new FormValidator();
  v.registerField('name', { type: 'name', required: true, label: '姓名', group: 'basic' });
  v.registerField('phone', { type: 'phone', required: true, label: '手机号', group: 'basic' });
  v.validateAll({ name: '', phone: '' });
  v.validateAll({ name: '', phone: '123' });
  var stats = v.getMonitoringStats();
  assert(stats.totalSubmissions >= 2, '应统计提交次数');
  assert(stats.totalErrors >= 2, '应统计总错误数');
  assert(Array.isArray(stats.topFieldErrors), 'topFieldErrors 应为数组');
  assert(stats.topFieldErrors.length > 0, '应有字段错误统计');
  assert(stats.topFieldErrors[0].total > 0, '最高频字段应大于0');
});

test('getMonitoringStats 同步错误按 rule 分类统计', function () {
  var v = new FormValidator();
  v.registerField('name', { type: 'name', required: true, label: '姓名' });
  v.validateAll({ name: '' });
  var stats = v.getMonitoringStats();
  assert(Array.isArray(stats.topRules), 'topRules 应为数组');
  assert(stats.topRules.length > 0, '应有规则统计');
  var requiredRule = stats.topRules.find(function (r) { return r.rule === 'required'; });
  assert(requiredRule !== undefined, '应有 required 规则统计');
  assert(requiredRule.count >= 1, 'required 至少命中1次');
});

test('getMonitoringStats trackingPayload 适合埋点上报', function () {
  var v = new FormValidator();
  v.registerField('name', { type: 'name', required: true, label: '姓名' });
  v.validateAll({ name: '' });
  var stats = v.getMonitoringStats();
  var p = stats.trackingPayload;
  assert(p !== undefined, '应含 trackingPayload');
  assertEqual(p.event, 'form_validation_summary', '埋点事件名');
  assert(typeof p.timestamp === 'string', '应带时间戳');
  assert(typeof p.totalSubmissions === 'number', '应带提交数');
  assert(typeof p.totalErrors === 'number', '应带错误数');
  assert(typeof p.avgErrorsPerSubmission === 'number', '应带平均错误数');
  assert(Array.isArray(p.topFieldErrors), 'topFieldErrors 数组');
  assert(Array.isArray(p.topRules), 'topRules 数组');
});

test('getMonitoringStats 分组和步骤统计', function () {
  var v = new FormValidator();
  v.registerField('a', { type: 'text', required: true, label: 'A', group: 'g1' });
  v.registerField('b', { type: 'text', required: true, label: 'B', group: 'g2' });
  v.registerStep('s1', { label: '步骤一', fields: ['a'] });
  v.registerStep('s2', { label: '步骤二', fields: ['b'] });
  v.validateAll({ a: '', b: '' });
  var stats = v.getMonitoringStats();
  assert(Array.isArray(stats.groupStats), 'groupStats 应为数组');
  assert(Array.isArray(stats.stepStats), 'stepStats 应为数组');
  assert(stats.groupStats.some(function (g) { return g.group === 'g1'; }), 'g1 应有统计');
  assert(stats.stepStats.some(function (s) { return s.step === 's1'; }), 's1 应有统计');
});

test('getMonitoringStats topN 参数限制条数', function () {
  var v = new FormValidator();
  for (var i = 0; i < 5; i++) {
    v.registerField('f' + i, { type: 'text', required: true, label: '字段' + i });
    var values = {};
    values['f' + i] = '';
    v.validateAll(values);
  }
  var stats = v.getMonitoringStats({ topN: 2 });
  assert(stats.topFieldErrors.length <= 2, 'topFieldErrors 条数应 <= topN');
  assert(stats.topRules.length <= 2, 'topRules 条数应 <= topN');
});

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
