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

console.log('========== 智能表单校验类库 V3 测试 ==========');
console.log('');

// ==============================================
// 一、字段联动增强（省市区/套餐优惠场景）
// ==============================================
console.log('--- 一、字段联动增强 ---');

test('deriveOptions - 上游变化时下游可选项自动更新', function (done) {
  var validator = new FormValidator();
  validator.registerFields({
    province: {
      type: 'text',
      required: true,
      debounce: 10
    },
    city: {
      type: 'text',
      required: true,
      dependsOn: ['province'],
      options: ['-请先选省份-'],
      deriveOptions: function (values, sourceField, sourceValue) {
        var map = {
          '北京': ['东城区', '西城区', '朝阳区'],
          '上海': ['黄浦区', '徐汇区', '浦东新区'],
          '广东': ['广州市', '深圳市', '东莞市']
        };
        return map[sourceValue] || ['-请先选省份-'];
      }
    }
  });
  validator.setFieldValue('province', '北京');
  setTimeout(function () {
    var meta = validator.getFieldMeta('city');
    assert(meta !== null, '应能获取 city 元数据');
    assertEqual(meta.options.length, 3, '北京应有3个区');
    assert(meta.options.indexOf('朝阳区') !== -1, '应包含朝阳区');
    done();
  }, 100);
});

test('deriveDefaultValue - 旧值不在新 options 中时重置为默认值', function (done) {
  var validator = new FormValidator();
  validator.setFieldValue('city', '广州市');
  validator.registerFields({
    province: { type: 'text', required: true, debounce: 10 },
    city: {
      type: 'text',
      required: true,
      dependsOn: ['province'],
      deriveOptions: function (values, sf, sv) {
        var map = {
          '北京': ['东城区', '西城区'],
          '广东': ['广州市', '深圳市']
        };
        return map[sv] || [];
      },
      deriveDefaultValue: function (values, sf, sv) {
        var map = {
          '北京': '东城区',
          '广东': '广州市'
        };
        return map[sv] || '';
      }
    }
  });
  validator.setFieldValue('city', '广州市');
  validator.setFieldValue('province', '北京');
  setTimeout(function () {
    assertEqual(validator.fieldValues.city, '东城区', '应重置为东城区');
    done();
  }, 100);
});

test('deriveRequired - 动态控制必填', function (done) {
  var validator = new FormValidator();
  validator.registerFields({
    hasCompany: { type: 'text', debounce: 10 },
    companyName: {
      type: 'text',
      dependsOn: ['hasCompany'],
      required: false,
      deriveRequired: function (values, sf, sv) {
        return sv === '是';
      }
    }
  });
  validator.setFieldValue('hasCompany', '否');
  setTimeout(function () {
    assert(validator.fields.companyName.required === false, '否时不应必填');
    validator.setFieldValue('hasCompany', '是');
    setTimeout(function () {
      assert(validator.fields.companyName.required === true, '是时应必填');
      done();
    }, 50);
  }, 50);
});

test('deriveDisabled - 动态控制禁用状态', function (done) {
  var validator = new FormValidator();
  validator.registerFields({
    packageType: { type: 'text', debounce: 10 },
    gift: {
      type: 'text',
      dependsOn: ['packageType'],
      deriveDisabled: function (values, sf, sv) {
        return sv === '基础版';
      }
    }
  });
  validator.setFieldValue('packageType', '豪华版');
  setTimeout(function () {
    assertEqual(validator.getFieldMeta('gift').disabled, false, '豪华版不禁用');
    validator.setFieldValue('packageType', '基础版');
    setTimeout(function () {
      assertEqual(validator.getFieldMeta('gift').disabled, true, '基础版应禁用');
      done();
    }, 50);
  }, 50);
});

test('deriveMessage - 动态更新提示文案', function (done) {
  var validator = new FormValidator();
  validator.registerFields({
    userType: { type: 'text', debounce: 10 },
    idNumber: {
      type: 'text',
      dependsOn: ['userType'],
      message: { required: '请输入证件号' },
      deriveMessage: function (values, sf, sv) {
        if (sv === '个人') {
          return { required: '请输入身份证号', pattern: '身份证号格式不正确' };
        } else {
          return { required: '请输入统一社会信用代码', pattern: '信用代码格式不正确' };
        }
      }
    }
  });
  validator.setFieldValue('userType', '个人');
  setTimeout(function () {
    assertEqual(validator.fields.idNumber.message.required, '请输入身份证号', '个人应显示身份证号提示');
    validator.setFieldValue('userType', '企业');
    setTimeout(function () {
      assertEqual(validator.fields.idNumber.message.required, '请输入统一社会信用代码', '企业应显示信用代码提示');
      done();
    }, 50);
  }, 50);
});

test('联动竞态控制 - 快速切换时下游与最后一次选择一致', function (done) {
  var validator = new FormValidator();
  var callCount = 0;
  validator.registerFields({
    province: { type: 'text', debounce: 5 },
    city: {
      type: 'text',
      dependsOn: ['province'],
      deriveOptions: function () {
        callCount++;
        var map = {
          '北京': ['东城区'],
          '上海': ['黄浦区'],
          '广东': ['广州市']
        };
        return map[arguments[2]] || [];
      }
    }
  });
  validator.setFieldValue('province', '北京');
  validator.setFieldValue('province', '上海');
  validator.setFieldValue('province', '广东');
  setTimeout(function () {
    var opts = validator.getFieldMeta('city').options;
    assertEqual(opts.length, 1, '最终应有1个选项');
    assertEqual(opts[0], '广州市', '最终应为广州市的选项');
    done();
  }, 100);
});

test('联动后清除下游旧校验状态', function (done) {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', debounce: 10 },
    city: {
      type: 'text',
      required: true,
      dependsOn: ['province'],
      deriveOptions: function (v, s, sv) { return [sv + '-市']; }
    }
  });
  validator.validateField('city', '');
  assert(validator.getFieldErrors('city').length > 0, '初始应存在错误');
  validator.setFieldValue('province', '北京');
  setTimeout(function () {
    assertEqual(validator.getFieldStatus('city'), FormValidator.VALIDATE_STATUS.PENDING,
      '联动后状态应重置为 pending');
    assertEqual(validator.getFieldErrors('city').length, 0, '联动后错误应清除');
    done();
  }, 50);
});

// ==============================================
// 二、错误面板增强（影响关系）
// ==============================================
console.log('');
console.log('--- 二、错误面板增强 ---');

test('priorities 中每条错误含 affectedBy 和 affects', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: true, group: 'loc' },
    city: {
      type: 'text',
      required: true,
      group: 'loc',
      dependsOn: ['province']
    },
    district: {
      type: 'text',
      required: true,
      group: 'loc',
      dependsOn: ['city']
    }
  });
  validator.setValues({ province: '', city: '', district: '' });
  var report = validator.getValidationReport();
  assert(report.priorities.length > 0, '应有优先级项');
  var cityItem = null;
  for (var i = 0; i < report.priorities.length; i++) {
    if (report.priorities[i].field === 'city') {
      cityItem = report.priorities[i];
      break;
    }
  }
  assert(cityItem !== null, '应找到 city 错误项');
  assert(Array.isArray(cityItem.affectedBy), 'affectedBy 应为数组');
  assert(cityItem.affectedBy.indexOf('province') !== -1, 'city 受 province 影响');
  assert(Array.isArray(cityItem.affects), 'affects 应为数组');
  assert(cityItem.affects.indexOf('district') !== -1, 'city 影响 district');
});

test('relatedFields 中源字段无错误但下游有错误时也会列出', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: false },
    city: {
      type: 'text',
      required: true,
      dependsOn: ['province']
    }
  });
  validator.setValues({ province: '北京', city: '' });
  var report = validator.getValidationReport();
  assert(report.relatedFields.province !== undefined,
    '即使 province 无错误，下游 city 有错误也应列出');
  assertEqual(report.relatedFields.province.hasError, false, 'province 自身无错误');
  assert(report.relatedFields.province.affects.length > 0, '应有下游影响');
  assertEqual(report.relatedFields.province.affects[0].field, 'city', '应影响 city');
});

test('relatedFields 结构含 label 和 errors 信息', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: false, label: '省份' },
    city: {
      type: 'text',
      required: true,
      label: '城市',
      dependsOn: ['province']
    }
  });
  validator.setValues({ province: '北京', city: '' });
  var report = validator.getValidationReport();
  var provRel = report.relatedFields.province;
  assertEqual(provRel.label, '省份', 'label 应正确');
  assertEqual(provRel.affects[0].label, '城市', '下游 label 应正确');
  assert(provRel.affects[0].errors.length > 0, '下游应有错误');
});

test('fieldRelations 包含所有字段的上下游关系', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: false },
    city: { type: 'text', required: true, dependsOn: ['province'] },
    district: { type: 'text', required: true, dependsOn: ['city'] }
  });
  validator.setValues({ province: '', city: '', district: '' });
  var report = validator.getValidationReport();
  assert(report.fieldRelations !== undefined, '应有 fieldRelations');
  assert(report.fieldRelations.province !== undefined, 'province 应有关系');
  assert(report.fieldRelations.city !== undefined, 'city 应有关系');
  assert(Array.isArray(report.fieldRelations.city.affectedBy), 'city.affectedBy 是数组');
  assert(Array.isArray(report.fieldRelations.city.affects), 'city.affects 是数组');
  assert(report.fieldRelations.city.affectedBy[0].field === 'province', 'city 上游是 province');
  assert(report.fieldRelations.city.affects[0].field === 'district', 'city 下游是 district');
  assertEqual(report.fieldRelations.city.hasError, true, 'city 有错误');
});

test('relatedErrorFields 列出关联字段中也有错误的', function () {
  var validator = new FormValidator();
  validator.registerFields({
    province: { type: 'text', required: true },
    city: { type: 'text', required: true, dependsOn: ['province'] }
  });
  validator.setValues({ province: '', city: '' });
  var report = validator.getValidationReport();
  var cityItem = report.priorities.find(function (p) { return p.field === 'city'; });
  assert(cityItem !== null, '应找到 city');
  assert(Array.isArray(cityItem.relatedErrorFields), 'relatedErrorFields 是数组');
  assert(cityItem.relatedErrorFields.indexOf('province') !== -1,
    'province 也有错误应被列出');
});

// ==============================================
// 三、异步校验摘要完整
// ==============================================
console.log('');
console.log('--- 三、异步校验摘要完整 ---');

test('validateAllAsync - 异步错误计入 summary.errorCount', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    debounce: 10,
    asyncValidator: function (value) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ valid: false, message: '该手机号已注册' });
        }, 20);
      });
    }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function (summary) {
    assert(summary.valid === false, '整体应不通过');
    assert(summary.errorCount >= 1, '错误数应>=1');
    done();
  });
});

test('validateAllAsync - 首个错误可能来自异步校验', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    debounce: 10,
    asyncValidator: function (value) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(false);
        }, 20);
      });
    },
    message: { async: '该手机号已注册' }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function (summary) {
    assert(summary.firstError !== null, '应有首个错误');
    var hasAsyncError = false;
    for (var i = 0; i < summary.errors.length; i++) {
      if (summary.errors[i].rule === 'async') {
        hasAsyncError = true;
        break;
      }
    }
    assert(hasAsyncError === true, '错误列表中应包含异步错误');
    done();
  });
});

test('validateAllAsync - 字段级 errors 包含异步错误', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    debounce: 10,
    asyncValidator: function (v) {
      return new Promise(function (r) { setTimeout(function () { r(false); }, 20); });
    },
    message: { async: '已注册' }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function () {
    var fieldErrors = validator.getFieldErrors('phone');
    var hasAsync = false;
    for (var i = 0; i < fieldErrors.length; i++) {
      if (fieldErrors[i].rule === 'async') { hasAsync = true; break; }
    }
    assert(hasAsync === true, '字段错误中应包含异步错误');
    done();
  });
});

test('validateAllAsync - fieldResults.valid 正确反映异步结果', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    debounce: 10,
    asyncValidator: function (v) {
      return new Promise(function (r) { setTimeout(function () { r(false); }, 20); });
    },
    message: { async: '已注册' }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function (summary) {
    assert(summary.fieldResults.phone.valid === false, 'phone 的 valid 应为 false');
    done();
  });
});

test('validateAllAsync - 分组统计包含异步错误', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    group: 'contact',
    debounce: 10,
    asyncValidator: function (v) {
      return new Promise(function (r) { setTimeout(function () { r(false); }, 20); });
    },
    message: { async: '已注册' }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function () {
    var report = validator.getValidationReport();
    assert(report.byGroup.contact !== undefined, '应有 contact 组');
    assert(report.byGroup.contact.errorCount >= 1, 'contact 组错误数应>=1');
    done();
  });
});

test('validateAllAsync - 步骤统计包含异步错误', function (done) {
  var validator = new FormValidator({ defaultDebounce: 10 });
  validator.registerField('phone', {
    type: 'phone',
    step: 'basic',
    debounce: 10,
    asyncValidator: function (v) {
      return new Promise(function (r) { setTimeout(function () { r(false); }, 20); });
    },
    message: { async: '已注册' }
  });
  validator.setFieldValue('phone', '13800138000');
  validator.validateAllAsync().then(function () {
    var report = validator.getValidationReport();
    assert(report.byStep.basic !== undefined, '应有 basic 步骤');
    assert(report.byStep.basic.errorCount >= 1, 'basic 步骤错误数应>=1');
    done();
  });
});

// ==============================================
// 四、规则草稿与发布
// ==============================================
console.log('');
console.log('--- 四、规则草稿与发布 ---');

test('saveDraft - 保存草稿返回信息', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var result = validator.saveDraft({ name: '注册表单草稿', description: '第一版草稿' });
  assert(result.id !== undefined && result.id !== null, '应返回草稿 ID');
  assertEqual(result.name, '注册表单草稿', '草稿名应正确');
  assertEqual(result.description, '第一版草稿', '描述应正确');
});

test('getDrafts - 返回草稿列表按时间倒序', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  validator.saveDraft({ name: '草稿A' });
  validator.saveDraft({ name: '草稿B' });
  validator.saveDraft({ name: '草稿C' });
  var drafts = validator.getDrafts();
  assertEqual(drafts.length, 3, '应有3个草稿');
  assertEqual(drafts[0].name, '草稿C', '最新的在最前');
  assertEqual(drafts[2].name, '草稿A', '最旧的在最后');
});

test('getDraft - 获取单个草稿', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: '测试草稿' });
  var draft = validator.getDraft(saved.id);
  assert(draft !== null, '应能获取草稿');
  assertEqual(draft.name, '测试草稿', '草稿名应匹配');
  assert(draft.schema !== undefined, '应包含 schema');
});

test('deleteDraft - 删除草稿', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: '要删除的草稿' });
  var delResult = validator.deleteDraft(saved.id);
  assertEqual(delResult, true, '删除应成功');
  assertEqual(validator.getDraft(saved.id), null, '删除后应获取不到');
});

test('publishDraft - 发布草稿为版本', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: '要发布的草稿' });
  var published = validator.publishDraft(saved.id, {
    version: '1.0.0',
    description: '正式发布第一版'
  });
  assert(published !== null, '发布应成功');
  assertEqual(published.version, '1.0.0', '版本号应正确');
  assertEqual(published.description, '正式发布第一版', '描述应正确');
});

test('publishDraft - 版本重复时 force=false 抛出错误', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved1 = validator.saveDraft({ name: '草稿1' });
  var saved2 = validator.saveDraft({ name: '草稿2' });
  validator.publishDraft(saved1.id, { version: '1.0.0' });
  var threw = false;
  try {
    validator.publishDraft(saved2.id, { version: '1.0.0' });
  } catch (e) {
    threw = true;
  }
  assert(threw === true, '重复版本应抛错');
});

test('publishDraft - force=true 时可以覆盖版本', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved1 = validator.saveDraft({ name: '草稿1' });
  var saved2 = validator.saveDraft({ name: '草稿2' });
  validator.publishDraft(saved1.id, { version: '1.0.0', description: 'v1' });
  var pub = validator.publishDraft(saved2.id, { version: '1.0.0', description: 'v2', force: true });
  assert(pub !== null, '强制覆盖应成功');
  assertEqual(validator.getPublishedVersion('1.0.0').description, 'v2', '描述应为 v2');
});

test('getPublishedVersions - 返回发布列表', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var s1 = validator.saveDraft({ name: 'd1' });
  var s2 = validator.saveDraft({ name: 'd2' });
  validator.publishDraft(s1.id, { version: '1.0.0' });
  validator.publishDraft(s2.id, { version: '1.1.0' });
  var versions = validator.getPublishedVersions();
  assertEqual(versions.length, 2, '应有2个发布版本');
  assertEqual(versions[0].version, '1.1.0', '新版本在前');
});

test('loadPublishedVersion - 加载发布版本到当前实例', function () {
  var validator1 = new FormValidator();
  validator1.registerField('name', { type: 'name', label: '用户姓名' });
  validator1.registerField('phone', { type: 'phone', label: '联系电话' });
  var saved = validator1.saveDraft({ name: '发布测试' });
  validator1.publishDraft(saved.id, { version: '2.0.0' });

  var validator2 = new FormValidator();
  validator2.loadPublishedVersion('2.0.0');
  assert(validator2.fields.name !== undefined, '应加载 name 字段');
  assert(validator2.fields.phone !== undefined, '应加载 phone 字段');
  assertEqual(validator2.fields.name.label, '用户姓名', 'label 应正确');
});

test('deletePublishedVersion - 删除发布版本', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: 'd' });
  validator.publishDraft(saved.id, { version: '3.0.0' });
  var result = validator.deletePublishedVersion('3.0.0');
  assertEqual(result, true, '删除应成功');
  assertEqual(validator.getPublishedVersion('3.0.0'), null, '删除后应获取不到');
});

test('previewDraft - 用草稿预览校验不影响当前实例', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: '预览草稿' });
  validator.registerField('phone', { type: 'phone' });
  var preview = validator.previewDraft(saved.id, { name: '' });
  assert(preview.syncResult !== undefined, '应有同步结果');
  assert(preview.syncResult.valid === false, '空 name 应不通过');
  assert(validator.fields.phone !== undefined, '当前实例的 phone 字段不应受影响');
});

test('previewDraft - 有异步校验时返回 asyncPromise', function () {
  var validator = new FormValidator();
  validator.registerField('phone', {
    type: 'phone',
    asyncValidator: function (v) {
      return new Promise(function (r) { setTimeout(function () { r(true); }, 10); });
    }
  });
  var saved = validator.saveDraft({ name: '异步草稿' });
  var preview = validator.previewDraft(saved.id, { phone: '13800138000' });
  assert(preview.asyncPromise !== null && typeof preview.asyncPromise.then === 'function',
    '应有 asyncPromise');
});

test('clearGlobalStorage - 清理全局草稿和发布版本', function () {
  var validator = new FormValidator();
  validator.registerField('name', { type: 'name' });
  var saved = validator.saveDraft({ name: '重置测试' });
  validator.publishDraft(saved.id, { version: '9.0.0' });
  assert(validator.getDrafts().length > 0, '清理前应有草稿');
  assert(validator.getPublishedVersions().length > 0, '清理前应有发布版本');
  FormValidator.clearGlobalStorage();
  assertEqual(validator.getDrafts().length, 0, '清理后无草稿');
  assertEqual(validator.getPublishedVersions().length, 0, '清理后无发布版本');
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
