;(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.FormValidator = factory());
})(this, function () {
  'use strict';

  var SEVERITY = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  };

  var VALIDATE_STATUS = {
    PENDING: 'pending',
    VALIDATING: 'validating',
    SUCCESS: 'success',
    ERROR: 'error'
  };

  var BUILTIN_RULES = {
    name: {
      type: 'name',
      label: '姓名',
      required: true,
      minLength: 2,
      maxLength: 20,
      pattern: /^[\u4e00-\u9fa5a-zA-Z·\s]+$/,
      message: {
        required: '请输入姓名',
        minLength: '姓名至少需要2个字符',
        maxLength: '姓名不能超过20个字符',
        pattern: '姓名只能包含中文、英文字母、空格和中间点'
      },
      severity: SEVERITY.ERROR
    },
    phone: {
      type: 'phone',
      label: '手机号',
      required: true,
      pattern: /^1[3-9]\d{9}$/,
      message: {
        required: '请输入手机号',
        pattern: '请输入正确的11位手机号码'
      },
      severity: SEVERITY.ERROR
    },
    date: {
      type: 'date',
      label: '日期',
      required: false,
      format: 'YYYY-MM-DD',
      message: {
        required: '请选择日期',
        format: '日期格式不正确，请使用YYYY-MM-DD格式',
        invalid: '请输入有效的日期',
        notExist: '该日期不存在，请检查'
      },
      severity: SEVERITY.ERROR
    },
    amount: {
      type: 'amount',
      label: '金额',
      required: true,
      min: 0.01,
      max: 99999999.99,
      precision: 2,
      message: {
        required: '请输入金额',
        min: '金额不能小于{min}元',
        max: '金额不能超过{max}元',
        precision: '金额最多保留{precision}位小数',
        pattern: '请输入有效的数字金额',
        hasLetter: '金额不能包含字母',
        multipleDots: '金额不能有多个小数点',
        hasSpace: '金额不能包含空格'
      },
      severity: SEVERITY.ERROR
    },
    address: {
      type: 'address',
      label: '地址',
      required: true,
      minLength: 5,
      maxLength: 200,
      message: {
        required: '请输入详细地址',
        minLength: '地址至少需要{minLength}个字符',
        maxLength: '地址不能超过{maxLength}个字符'
      },
      severity: SEVERITY.ERROR
    },
    multiSelect: {
      type: 'multiSelect',
      label: '多选项',
      required: false,
      minCount: 0,
      maxCount: Infinity,
      message: {
        required: '请至少选择一项',
        minCount: '至少选择{minCount}项',
        maxCount: '最多选择{maxCount}项'
      },
      severity: SEVERITY.ERROR
    }
  };

  function FormValidator(options) {
    options = options || {};
    this.fields = {};
    this.errors = {};
    this.warnings = {};
    this.groups = {};
    this.fieldValues = {};
    this.fieldStatus = {};
    this.lastSummary = null;
    this.summaryStorageKey = options.summaryStorageKey || 'form_validator_last_summary';
    this.customRules = {};
    this.onFieldValidate = options.onFieldValidate || null;
    this.onFormValidate = options.onFormValidate || null;
    this.onAsyncFieldValidate = options.onAsyncFieldValidate || null;
    this.locale = options.locale || 'zh-CN';
    this.enableSummaryPersistence = options.enableSummaryPersistence !== false;
    this.defaultDebounce = options.defaultDebounce !== undefined ? options.defaultDebounce : 300;
    this._asyncTimers = {};
    this._asyncRequestId = {};
    this._asyncResults = {};
  }

  FormValidator.SEVERITY = SEVERITY;
  FormValidator.BUILTIN_RULES = BUILTIN_RULES;
  FormValidator.VALIDATE_STATUS = VALIDATE_STATUS;

  FormValidator.prototype.registerField = function (fieldName, config) {
    if (!fieldName || typeof fieldName !== 'string') {
      throw new Error('字段名不能为空且必须为字符串');
    }
    var ruleConfig = {};
    var type = config.type;
    if (type && BUILTIN_RULES[type]) {
      ruleConfig = deepClone(BUILTIN_RULES[type]);
    }
    ruleConfig = mergeDeep(ruleConfig, config);
    ruleConfig.name = fieldName;
    ruleConfig.label = ruleConfig.label || fieldName;
    ruleConfig.severity = ruleConfig.severity || SEVERITY.ERROR;
    ruleConfig.debounce = ruleConfig.debounce !== undefined ? ruleConfig.debounce : this.defaultDebounce;
    if (ruleConfig.group) {
      if (!this.groups[ruleConfig.group]) {
        this.groups[ruleConfig.group] = [];
      }
      if (this.groups[ruleConfig.group].indexOf(fieldName) === -1) {
        this.groups[ruleConfig.group].push(fieldName);
      }
    }
    this.fields[fieldName] = ruleConfig;
    this.errors[fieldName] = [];
    this.warnings[fieldName] = [];
    this.fieldStatus[fieldName] = VALIDATE_STATUS.PENDING;
    return this;
  };

  FormValidator.prototype.registerFields = function (fieldsConfig) {
    if (!fieldsConfig || typeof fieldsConfig !== 'object') {
      throw new Error('字段配置必须为对象');
    }
    for (var fieldName in fieldsConfig) {
      if (fieldsConfig.hasOwnProperty(fieldName)) {
        this.registerField(fieldName, fieldsConfig[fieldName]);
      }
    }
    return this;
  };

  FormValidator.prototype.registerCustomRule = function (ruleName, validator, message) {
    if (!ruleName || typeof validator !== 'function') {
      throw new Error('自定义规则名和校验函数不能为空');
    }
    this.customRules[ruleName] = {
      validator: validator,
      message: message || '校验不通过'
    };
    return this;
  };

  FormValidator.prototype.validateField = function (fieldName, value) {
    var field = this.fields[fieldName];
    if (!field) {
      return { valid: true, errors: [], warnings: [], field: fieldName };
    }
    if (typeof value === 'undefined') {
      value = this.fieldValues[fieldName];
    } else {
      this.fieldValues[fieldName] = value;
    }
    var errors = [];
    var warnings = [];
    var isEmpty = this._isEmpty(value);
    var skipTypeValidation = isEmpty && field.type !== 'multiSelect';
    if (isEmpty && field.required && field.type !== 'multiSelect') {
      errors.push(this._createError(fieldName, 'required', this._getMessage(field, 'required'), field.severity));
    }
    if (!skipTypeValidation) {
      var typeErrors = this._validateByType(field, value);
      for (var i = 0; i < typeErrors.length; i++) {
        if (typeErrors[i].severity === SEVERITY.WARNING) {
          warnings.push(typeErrors[i]);
        } else {
          errors.push(typeErrors[i]);
        }
      }
      if (field.customRules && field.customRules.length > 0 && errors.length === 0) {
        for (var j = 0; j < field.customRules.length; j++) {
          var customRuleName = field.customRules[j];
          var customRule = this.customRules[customRuleName];
          if (customRule) {
            try {
              var valid = customRule.validator(value, this.fieldValues, field);
              if (valid === false) {
                errors.push(this._createError(fieldName, customRuleName, customRule.message, field.severity));
              } else if (typeof valid === 'string') {
                errors.push(this._createError(fieldName, customRuleName, valid, field.severity));
              }
            } catch (e) {
              errors.push(this._createError(fieldName, customRuleName, '校验异常：' + e.message, SEVERITY.ERROR));
            }
          }
        }
      }
      if (field.validator && typeof field.validator === 'function' && errors.length === 0) {
        try {
          var result = field.validator(value, this.fieldValues, field);
          if (result === false) {
            errors.push(this._createError(fieldName, 'custom', field.message && field.message.custom || '校验不通过', field.severity));
          } else if (typeof result === 'string') {
            errors.push(this._createError(fieldName, 'custom', result, field.severity));
          } else if (result && typeof result === 'object') {
            if (result.valid === false) {
              var sev = result.severity || field.severity;
              var err = this._createError(fieldName, result.rule || 'custom', result.message || '校验不通过', sev);
              if (sev === SEVERITY.WARNING) {
                warnings.push(err);
              } else {
                errors.push(err);
              }
            }
          }
        } catch (e) {
          errors.push(this._createError(fieldName, 'custom', '校验异常：' + e.message, SEVERITY.ERROR));
        }
      }
    }
    this.errors[fieldName] = errors;
    this.warnings[fieldName] = warnings;
    this.fieldStatus[fieldName] = errors.length === 0 ? VALIDATE_STATUS.SUCCESS : VALIDATE_STATUS.ERROR;
    var resultObj = {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      field: fieldName,
      value: value,
      status: this.fieldStatus[fieldName],
      timestamp: Date.now()
    };
    if (this.onFieldValidate && typeof this.onFieldValidate === 'function') {
      this.onFieldValidate(resultObj);
    }
    return resultObj;
  };

  FormValidator.prototype.validateFieldAsync = function (fieldName, value) {
    var self = this;
    var field = this.fields[fieldName];
    if (!field) {
      return Promise.resolve({ valid: true, errors: [], warnings: [], field: fieldName, async: false });
    }
    if (typeof value !== 'undefined') {
      this.fieldValues[fieldName] = value;
    }
    var syncResult = this.validateField(fieldName);
    if (!syncResult.valid) {
      return Promise.resolve(syncResult);
    }
    if (!field.asyncValidator || typeof field.asyncValidator !== 'function') {
      return Promise.resolve(syncResult);
    }
    this.fieldStatus[fieldName] = VALIDATE_STATUS.VALIDATING;
    if (this._asyncTimers[fieldName]) {
      clearTimeout(this._asyncTimers[fieldName]);
    }
    var currentValue = this.fieldValues[fieldName];
    if (!this._asyncRequestId[fieldName]) {
      this._asyncRequestId[fieldName] = 0;
    }
    this._asyncRequestId[fieldName]++;
    var requestId = this._asyncRequestId[fieldName];
    return new Promise(function (resolve) {
      var debounceMs = field.debounce !== undefined ? field.debounce : self.defaultDebounce;
      self._asyncTimers[fieldName] = setTimeout(function () {
        var fieldConfig = self.fields[fieldName];
        if (!fieldConfig || !fieldConfig.asyncValidator) {
          resolve(syncResult);
          return;
        }
        try {
          var asyncResult = fieldConfig.asyncValidator(currentValue, self.fieldValues, fieldConfig);
          if (asyncResult && typeof asyncResult.then === 'function') {
            asyncResult.then(function (res) {
              if (requestId !== self._asyncRequestId[fieldName]) {
                return;
              }
              self._handleAsyncResult(fieldName, currentValue, res, syncResult, requestId);
              var finalResult = self._buildAsyncResult(fieldName, currentValue, syncResult);
              resolve(finalResult);
            }).catch(function (err) {
              if (requestId !== self._asyncRequestId[fieldName]) {
                return;
              }
              self._handleAsyncError(fieldName, currentValue, err, syncResult);
              var finalResult = self._buildAsyncResult(fieldName, currentValue, syncResult);
              resolve(finalResult);
            });
          } else {
            if (requestId !== self._asyncRequestId[fieldName]) {
              return;
            }
            self._handleAsyncResult(fieldName, currentValue, asyncResult, syncResult, requestId);
            var finalResult = self._buildAsyncResult(fieldName, currentValue, syncResult);
            resolve(finalResult);
          }
        } catch (e) {
          if (requestId !== self._asyncRequestId[fieldName]) {
            return;
          }
          self._handleAsyncError(fieldName, currentValue, e, syncResult);
          var finalResult = self._buildAsyncResult(fieldName, currentValue, syncResult);
          resolve(finalResult);
        }
      }, debounceMs);
      if (self.onAsyncFieldValidate && typeof self.onAsyncFieldValidate === 'function') {
        self.onAsyncFieldValidate({
          field: fieldName,
          status: VALIDATE_STATUS.VALIDATING,
          value: currentValue
        });
      }
    });
  };

  FormValidator.prototype._handleAsyncResult = function (fieldName, value, asyncResult, syncResult, requestId) {
    var field = this.fields[fieldName];
    var asyncErrors = [];
    var asyncWarnings = [];
    if (asyncResult === false) {
      asyncErrors.push(this._createError(fieldName, 'async',
        field.message && field.message.async ? field.message.async : '校验不通过',
        field.severity));
    } else if (typeof asyncResult === 'string') {
      asyncErrors.push(this._createError(fieldName, 'async', asyncResult, field.severity));
    } else if (asyncResult && typeof asyncResult === 'object') {
      if (asyncResult.valid === false) {
        var sev = asyncResult.severity || field.severity;
        var err = this._createError(fieldName, asyncResult.rule || 'async',
          asyncResult.message || '校验不通过', sev);
        if (sev === SEVERITY.WARNING) {
          asyncWarnings.push(err);
        } else {
          asyncErrors.push(err);
        }
      }
    }
    var allErrors = (syncResult.errors || []).concat(asyncErrors);
    var allWarnings = (syncResult.warnings || []).concat(asyncWarnings);
    this.errors[fieldName] = allErrors;
    this.warnings[fieldName] = allWarnings;
    this._asyncResults[fieldName] = {
      value: value,
      valid: asyncErrors.length === 0,
      errors: asyncErrors,
      warnings: asyncWarnings,
      requestId: requestId
    };
    this.fieldStatus[fieldName] = allErrors.length === 0 ? VALIDATE_STATUS.SUCCESS : VALIDATE_STATUS.ERROR;
    var resultObj = {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      field: fieldName,
      value: value,
      status: this.fieldStatus[fieldName],
      async: true,
      timestamp: Date.now()
    };
    if (this.onFieldValidate && typeof this.onFieldValidate === 'function') {
      this.onFieldValidate(resultObj);
    }
  };

  FormValidator.prototype._handleAsyncError = function (fieldName, value, error, syncResult) {
    var field = this.fields[fieldName];
    var errMsg = error && error.message ? error.message : '异步校验失败';
    var asyncErr = this._createError(fieldName, 'async', errMsg, SEVERITY.ERROR);
    var allErrors = (syncResult.errors || []).concat([asyncErr]);
    var allWarnings = syncResult.warnings || [];
    this.errors[fieldName] = allErrors;
    this.warnings[fieldName] = allWarnings;
    this.fieldStatus[fieldName] = VALIDATE_STATUS.ERROR;
    this._asyncResults[fieldName] = {
      value: value,
      valid: false,
      errors: [asyncErr],
      warnings: [],
      error: error
    };
  };

  FormValidator.prototype._buildAsyncResult = function (fieldName, value, syncResult) {
    var errors = this.errors[fieldName] || syncResult.errors || [];
    var warnings = this.warnings[fieldName] || syncResult.warnings || [];
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      field: fieldName,
      value: value,
      status: this.fieldStatus[fieldName],
      async: true,
      timestamp: Date.now()
    };
  };

  FormValidator.prototype.validateAll = function (values) {
    var allErrors = [];
    var allWarnings = [];
    var fieldResults = {};
    var hasError = false;
    var fieldsToValidate = [];
    var vals = values || this.fieldValues;
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        if (this._isFieldVisible(fieldName, vals)) {
          fieldsToValidate.push(fieldName);
        }
      }
    }
    for (var i = 0; i < fieldsToValidate.length; i++) {
      var fn = fieldsToValidate[i];
      var val = values && values[fn] !== undefined ? values[fn] : this.fieldValues[fn];
      var result = this.validateField(fn, val);
      fieldResults[fn] = result;
      if (result.errors.length > 0) {
        hasError = true;
        allErrors = allErrors.concat(result.errors);
      }
      if (result.warnings.length > 0) {
        allWarnings = allWarnings.concat(result.warnings);
      }
    }
    var duplicateErrors = this._detectDuplicates(vals);
    for (var k = 0; k < duplicateErrors.length; k++) {
      var dupErr = duplicateErrors[k];
      var dupField = dupErr.field;
      if (this.errors[dupField]) {
        this.errors[dupField].push(dupErr);
      }
      allErrors.push(dupErr);
    }
    if (duplicateErrors.length > 0) {
      hasError = true;
      for (var df = 0; df < duplicateErrors.length; df++) {
        var dupFieldName = duplicateErrors[df].field;
        if (fieldResults[dupFieldName]) {
          fieldResults[dupFieldName].errors.push(duplicateErrors[df]);
          fieldResults[dupFieldName].valid = fieldResults[dupFieldName].errors.length === 0;
        }
      }
    }
    var summary = {
      valid: !hasError,
      totalFields: fieldsToValidate.length,
      errorCount: allErrors.length,
      warningCount: allWarnings.length,
      errors: allErrors,
      warnings: allWarnings,
      fieldResults: fieldResults,
      firstError: allErrors.length > 0 ? allErrors[0] : null,
      timestamp: Date.now()
    };
    this.lastSummary = summary;
    if (this.enableSummaryPersistence) {
      this._saveSummary(summary);
    }
    if (this.onFormValidate && typeof this.onFormValidate === 'function') {
      this.onFormValidate(summary);
    }
    return summary;
  };

  FormValidator.prototype.validateAllAsync = function (values) {
    var self = this;
    var syncSummary = this.validateAll(values);
    if (syncSummary.valid === false) {
      return Promise.resolve(syncSummary);
    }
    var asyncFields = [];
    var vals = values || this.fieldValues;
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        var field = this.fields[fieldName];
        if (field.asyncValidator && typeof field.asyncValidator === 'function' && this._isFieldVisible(fieldName, vals)) {
          asyncFields.push(fieldName);
        }
      }
    }
    if (asyncFields.length === 0) {
      return Promise.resolve(syncSummary);
    }
    var promises = [];
    for (var i = 0; i < asyncFields.length; i++) {
      var fn = asyncFields[i];
      promises.push(this.validateFieldAsync(fn));
    }
    return Promise.all(promises).then(function () {
      var finalSummary = self.validateAll(vals);
      var hasAsyncError = false;
      for (var j = 0; j < asyncFields.length; j++) {
        var afn = asyncFields[j];
        var asyncResult = self._asyncResults[afn];
        if (asyncResult && !asyncResult.valid) {
          hasAsyncError = true;
        }
      }
      if (hasAsyncError) {
        finalSummary.valid = false;
      }
      return finalSummary;
    });
  };

  FormValidator.prototype.setFieldValue = function (fieldName, value) {
    this.fieldValues[fieldName] = value;
    return this;
  };

  FormValidator.prototype.setValues = function (values) {
    if (values && typeof values === 'object') {
      for (var key in values) {
        if (values.hasOwnProperty(key)) {
          this.fieldValues[key] = values[key];
        }
      }
    }
    return this;
  };

  FormValidator.prototype.getFieldErrors = function (fieldName) {
    return this.errors[fieldName] || [];
  };

  FormValidator.prototype.getFieldWarnings = function (fieldName) {
    return this.warnings[fieldName] || [];
  };

  FormValidator.prototype.getFieldStatus = function (fieldName) {
    return this.fieldStatus[fieldName] || VALIDATE_STATUS.PENDING;
  };

  FormValidator.prototype.getAllErrors = function () {
    var allErrors = [];
    var fieldOrder = this._getFieldOrder();
    for (var i = 0; i < fieldOrder.length; i++) {
      var fieldName = fieldOrder[i];
      if (this.errors[fieldName] && this.errors[fieldName].length > 0) {
        allErrors = allErrors.concat(this.errors[fieldName]);
      }
    }
    return allErrors;
  };

  FormValidator.prototype.getAllWarnings = function () {
    var allWarnings = [];
    var fieldOrder = this._getFieldOrder();
    for (var i = 0; i < fieldOrder.length; i++) {
      var fieldName = fieldOrder[i];
      if (this.warnings[fieldName] && this.warnings[fieldName].length > 0) {
        allWarnings = allWarnings.concat(this.warnings[fieldName]);
      }
    }
    return allWarnings;
  };

  FormValidator.prototype._getFieldOrder = function () {
    return Object.keys(this.fields);
  };

  FormValidator.prototype.getFirstError = function () {
    var errors = this.getAllErrors();
    return errors.length > 0 ? errors[0] : null;
  };

  FormValidator.prototype.clearFieldStatus = function (fieldName) {
    if (fieldName) {
      this.errors[fieldName] = [];
      this.warnings[fieldName] = [];
      this.fieldStatus[fieldName] = VALIDATE_STATUS.PENDING;
      this._asyncResults[fieldName] = null;
      if (this._asyncTimers[fieldName]) {
        clearTimeout(this._asyncTimers[fieldName]);
        this._asyncTimers[fieldName] = null;
      }
      this._asyncRequestId[fieldName] = 0;
    } else {
      for (var fn in this.errors) {
        if (this.errors.hasOwnProperty(fn)) {
          this.errors[fn] = [];
        }
      }
      for (var fw in this.warnings) {
        if (this.warnings.hasOwnProperty(fw)) {
          this.warnings[fw] = [];
        }
      }
      for (var fs in this.fieldStatus) {
        if (this.fieldStatus.hasOwnProperty(fs)) {
          this.fieldStatus[fs] = VALIDATE_STATUS.PENDING;
        }
      }
      for (var at in this._asyncTimers) {
        if (this._asyncTimers.hasOwnProperty(at) && this._asyncTimers[at]) {
          clearTimeout(this._asyncTimers[at]);
        }
      }
      this._asyncTimers = {};
      this._asyncRequestId = {};
      this._asyncResults = {};
    }
    return this;
  };

  FormValidator.prototype.clearAllStatus = function () {
    return this.clearFieldStatus();
  };

  FormValidator.prototype.cancelAsyncValidation = function (fieldName) {
    if (fieldName) {
      if (this._asyncTimers[fieldName]) {
        clearTimeout(this._asyncTimers[fieldName]);
        this._asyncTimers[fieldName] = null;
      }
      if (this._asyncRequestId[fieldName]) {
        this._asyncRequestId[fieldName]++;
      }
    } else {
      for (var fn in this._asyncTimers) {
        if (this._asyncTimers.hasOwnProperty(fn) && this._asyncTimers[fn]) {
          clearTimeout(this._asyncTimers[fn]);
        }
      }
      this._asyncTimers = {};
      for (var key in this._asyncRequestId) {
        if (this._asyncRequestId.hasOwnProperty(key)) {
          this._asyncRequestId[key]++;
        }
      }
    }
    return this;
  };

  FormValidator.prototype.calculateProgress = function (values) {
    var vals = values || this.fieldValues;
    var total = 0;
    var completed = 0;
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        var field = this.fields[fieldName];
        if (!this._isFieldVisible(fieldName, vals)) {
          continue;
        }
        var weight = field.weight !== undefined ? field.weight : 1;
        total += weight;
        var value = vals[fieldName];
        if (!this._isEmpty(value)) {
          var result = this.validateField(fieldName, value);
          if (result.valid) {
            completed += weight;
          }
        }
      }
    }
    var percentage = total > 0 ? Math.round((completed / total) * 100) : 100;
    return {
      total: total,
      completed: completed,
      percentage: percentage,
      remaining: total - completed
    };
  };

  FormValidator.prototype.getGroupProgress = function (groupName, values) {
    if (!this.groups[groupName]) {
      return { total: 0, completed: 0, percentage: 0, remaining: 0 };
    }
    var vals = values || this.fieldValues;
    var total = 0;
    var completed = 0;
    var fields = this.groups[groupName];
    for (var i = 0; i < fields.length; i++) {
      var fieldName = fields[i];
      var field = this.fields[fieldName];
      if (!field || !this._isFieldVisible(fieldName, vals)) {
        continue;
      }
      var weight = field.weight !== undefined ? field.weight : 1;
      total += weight;
      var value = vals[fieldName];
      if (!this._isEmpty(value)) {
        var result = this.validateField(fieldName, value);
        if (result.valid) {
          completed += weight;
        }
      }
    }
    return {
      total: total,
      completed: completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 100,
      remaining: total - completed
    };
  };

  FormValidator.prototype.getIncompleteByGroup = function (values) {
    var vals = values || this.fieldValues;
    var result = {};
    for (var groupName in this.groups) {
      if (this.groups.hasOwnProperty(groupName)) {
        var incomplete = [];
        var fields = this.groups[groupName];
        for (var i = 0; i < fields.length; i++) {
          var fieldName = fields[i];
          var field = this.fields[fieldName];
          if (!field || !this._isFieldVisible(fieldName, vals)) {
            continue;
          }
          var value = vals[fieldName];
          var isIncomplete = false;
          if (field.required && this._isEmpty(value)) {
            isIncomplete = true;
          } else if (!this._isEmpty(value)) {
            var fieldErrors = this.errors[fieldName] || [];
            if (fieldErrors.length > 0) {
              isIncomplete = true;
            }
          }
          if (isIncomplete) {
            incomplete.push({
              field: fieldName,
              label: field.label,
              errors: this.errors[fieldName] || [],
              isEmpty: this._isEmpty(value),
              status: this.fieldStatus[fieldName]
            });
          }
        }
        result[groupName] = {
          count: incomplete.length,
          fields: incomplete
        };
      }
    }
    return result;
  };

  FormValidator.prototype.isFieldVisible = function (fieldName, values) {
    return this._isFieldVisible(fieldName, values || this.fieldValues);
  };

  FormValidator.prototype.generateSuggestions = function (errors) {
    errors = errors || this.getAllErrors();
    var suggestions = [];
    for (var i = 0; i < errors.length; i++) {
      var error = errors[i];
      var field = this.fields[error.field];
      if (!field) continue;
      var suggestion = {
        field: error.field,
        label: field.label,
        message: error.message,
        suggestion: this._generateSuggestionText(error, field),
        severity: error.severity,
        rule: error.rule
      };
      suggestions.push(suggestion);
    }
    return suggestions;
  };

  FormValidator.prototype.getLastSummary = function () {
    if (!this.lastSummary && this.enableSummaryPersistence) {
      var saved = this._loadSummary();
      if (saved) {
        this.lastSummary = saved;
      }
    }
    return this.lastSummary;
  };

  FormValidator.prototype.formatErrorMessage = function (error) {
    if (!error) return '';
    var field = this.fields[error.field];
    var label = field ? field.label : error.field;
    return '[' + label + '] ' + error.message;
  };

  FormValidator.prototype.formatAllErrors = function (separator) {
    separator = separator || '\n';
    var errors = this.getAllErrors();
    var formatted = [];
    for (var i = 0; i < errors.length; i++) {
      formatted.push(this.formatErrorMessage(errors[i]));
    }
    return formatted.join(separator);
  };

  FormValidator.prototype.getFieldsByGroup = function (groupName) {
    return this.groups[groupName] || [];
  };

  FormValidator.prototype.getAllGroups = function () {
    return Object.keys(this.groups);
  };

  FormValidator.prototype.exportSchema = function () {
    var schema = {
      version: '1.0',
      locale: this.locale,
      defaultDebounce: this.defaultDebounce,
      groups: deepClone(this.groups),
      fields: {},
      customRules: []
    };
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        var fieldConfig = deepClone(this.fields[fieldName]);
        if (fieldConfig.pattern && fieldConfig.pattern instanceof RegExp) {
          fieldConfig.pattern = {
            __type: 'RegExp',
            source: fieldConfig.pattern.source,
            flags: fieldConfig.pattern.flags
          };
        }
        delete fieldConfig.validator;
        delete fieldConfig.asyncValidator;
        delete fieldConfig.name;
        schema.fields[fieldName] = fieldConfig;
      }
    }
    for (var ruleName in this.customRules) {
      if (this.customRules.hasOwnProperty(ruleName)) {
        schema.customRules.push({
          name: ruleName,
          message: this.customRules[ruleName].message
        });
      }
    }
    return schema;
  };

  FormValidator.prototype.importSchema = function (schema, options) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema 不能为空');
    }
    options = options || {};
    if (options.reset !== false) {
      this.reset();
    }
    if (schema.locale) {
      this.locale = schema.locale;
    }
    if (schema.defaultDebounce !== undefined) {
      this.defaultDebounce = schema.defaultDebounce;
    }
    if (schema.fields && typeof schema.fields === 'object') {
      for (var fieldName in schema.fields) {
        if (schema.fields.hasOwnProperty(fieldName)) {
          var fieldConfig = deepClone(schema.fields[fieldName]);
          if (fieldConfig.pattern && fieldConfig.pattern.__type === 'RegExp') {
            fieldConfig.pattern = new RegExp(fieldConfig.pattern.source, fieldConfig.pattern.flags);
          }
          this.registerField(fieldName, fieldConfig);
        }
      }
    }
    return this;
  };

  FormValidator.prototype.reset = function () {
    this.fields = {};
    this.errors = {};
    this.warnings = {};
    this.groups = {};
    this.fieldValues = {};
    this.fieldStatus = {};
    this.lastSummary = null;
    this.customRules = {};
    this._asyncTimers = {};
    this._asyncRequestId = {};
    this._asyncResults = {};
    return this;
  };

  FormValidator.prototype._isEmpty = function (value) {
    if (value === null || value === undefined || value === '') {
      return true;
    }
    if (Array.isArray(value) && value.length === 0) {
      return true;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).length === 0;
    }
    return false;
  };

  FormValidator.prototype._validateByType = function (field, value) {
    var errors = [];
    var type = field.type;
    switch (type) {
      case 'name':
        errors = errors.concat(this._validateName(field, value));
        break;
      case 'phone':
        errors = errors.concat(this._validatePhone(field, value));
        break;
      case 'date':
        errors = errors.concat(this._validateDate(field, value));
        break;
      case 'amount':
        errors = errors.concat(this._validateAmount(field, value));
        break;
      case 'address':
        errors = errors.concat(this._validateAddress(field, value));
        break;
      case 'multiSelect':
        errors = errors.concat(this._validateMultiSelect(field, value));
        break;
      default:
        errors = errors.concat(this._validateGeneric(field, value));
    }
    return errors;
  };

  FormValidator.prototype._validateName = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (field.minLength !== undefined && strValue.length < field.minLength) {
      errors.push(this._createError(field.name, 'minLength',
        this._formatMessage(this._getMessage(field, 'minLength'), { minLength: field.minLength }),
        field.severity));
    }
    if (field.maxLength !== undefined && strValue.length > field.maxLength) {
      errors.push(this._createError(field.name, 'maxLength',
        this._formatMessage(this._getMessage(field, 'maxLength'), { maxLength: field.maxLength }),
        field.severity));
    }
    if (field.pattern && !field.pattern.test(strValue)) {
      errors.push(this._createError(field.name, 'pattern',
        this._getMessage(field, 'pattern'),
        field.severity));
    }
    return errors;
  };

  FormValidator.prototype._validatePhone = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (field.pattern && !field.pattern.test(strValue)) {
      errors.push(this._createError(field.name, 'pattern',
        this._getMessage(field, 'pattern'),
        field.severity));
    }
    return errors;
  };

  FormValidator.prototype._validateDate = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (field.format) {
      var formatPattern = this._getDatePattern(field.format);
      if (formatPattern && !formatPattern.test(strValue)) {
        errors.push(this._createError(field.name, 'format',
          this._getMessage(field, 'format'),
          field.severity));
        return errors;
      }
    }
    var parsedDate = this._parseDate(strValue, field.format);
    if (!parsedDate) {
      errors.push(this._createError(field.name, 'invalid',
        this._getMessage(field, 'invalid'),
        field.severity));
      return errors;
    }
    if (!this._isValidDate(parsedDate.year, parsedDate.month, parsedDate.day)) {
      errors.push(this._createError(field.name, 'notExist',
        this._getMessage(field, 'notExist'),
        field.severity));
      return errors;
    }
    var dateObj = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day);
    if (isNaN(dateObj.getTime())) {
      errors.push(this._createError(field.name, 'invalid',
        this._getMessage(field, 'invalid'),
        field.severity));
      return errors;
    }
    if (field.minDate) {
      var minDateObj = new Date(field.minDate);
      if (dateObj < minDateObj) {
        errors.push(this._createError(field.name, 'minDate',
          '日期不能早于' + field.minDate,
          field.severity));
      }
    }
    if (field.maxDate) {
      var maxDateObj = new Date(field.maxDate);
      if (dateObj > maxDateObj) {
        errors.push(this._createError(field.name, 'maxDate',
          '日期不能晚于' + field.maxDate,
          field.severity));
      }
    }
    return errors;
  };

  FormValidator.prototype._parseDate = function (strValue, format) {
    var match;
    switch (format) {
      case 'YYYY-MM-DD':
        match = strValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          return { year: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
        }
        break;
      case 'YYYY/MM/DD':
        match = strValue.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
        if (match) {
          return { year: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
        }
        break;
      case 'MM-DD-YYYY':
        match = strValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (match) {
          return { year: parseInt(match[3], 10), month: parseInt(match[1], 10), day: parseInt(match[2], 10) };
        }
        break;
      case 'DD-MM-YYYY':
        match = strValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (match) {
          return { year: parseInt(match[3], 10), month: parseInt(match[2], 10), day: parseInt(match[1], 10) };
        }
        break;
      default:
        return null;
    }
    return null;
  };

  FormValidator.prototype._isValidDate = function (year, month, day) {
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    var daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (this._isLeapYear(year)) {
      daysInMonth[1] = 29;
    }
    return day <= daysInMonth[month - 1];
  };

  FormValidator.prototype._isLeapYear = function (year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  };

  FormValidator.prototype._validateAmount = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (/\s/.test(strValue)) {
      errors.push(this._createError(field.name, 'hasSpace',
        this._getMessage(field, 'hasSpace'),
        field.severity));
      return errors;
    }
    if (/[a-zA-Z\u4e00-\u9fa5]/.test(strValue)) {
      errors.push(this._createError(field.name, 'hasLetter',
        this._getMessage(field, 'hasLetter'),
        field.severity));
      return errors;
    }
    var dotCount = (strValue.match(/\./g) || []).length;
    if (dotCount > 1) {
      errors.push(this._createError(field.name, 'multipleDots',
        this._getMessage(field, 'multipleDots'),
        field.severity));
      return errors;
    }
    if (!/^-?\d*\.?\d+$/.test(strValue) && !/^-?\d+\.?\d*$/.test(strValue)) {
      errors.push(this._createError(field.name, 'pattern',
        this._getMessage(field, 'pattern'),
        field.severity));
      return errors;
    }
    var numValue = parseFloat(strValue);
    if (isNaN(numValue)) {
      errors.push(this._createError(field.name, 'pattern',
        this._getMessage(field, 'pattern'),
        field.severity));
      return errors;
    }
    if (field.min !== undefined && numValue < field.min) {
      errors.push(this._createError(field.name, 'min',
        this._formatMessage(this._getMessage(field, 'min'), { min: field.min }),
        field.severity));
    }
    if (field.max !== undefined && numValue > field.max) {
      errors.push(this._createError(field.name, 'max',
        this._formatMessage(this._getMessage(field, 'max'), { max: field.max }),
        field.severity));
    }
    if (field.precision !== undefined) {
      var decimalIndex = strValue.indexOf('.');
      if (decimalIndex !== -1 && strValue.slice(decimalIndex + 1).length > field.precision) {
        errors.push(this._createError(field.name, 'precision',
          this._formatMessage(this._getMessage(field, 'precision'), { precision: field.precision }),
          field.severity));
      }
    }
    return errors;
  };

  FormValidator.prototype._validateAddress = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (field.minLength !== undefined && strValue.length < field.minLength) {
      errors.push(this._createError(field.name, 'minLength',
        this._formatMessage(this._getMessage(field, 'minLength'), { minLength: field.minLength }),
        field.severity));
    }
    if (field.maxLength !== undefined && strValue.length > field.maxLength) {
      errors.push(this._createError(field.name, 'maxLength',
        this._formatMessage(this._getMessage(field, 'maxLength'), { maxLength: field.maxLength }),
        field.severity));
    }
    return errors;
  };

  FormValidator.prototype._validateMultiSelect = function (field, value) {
    var errors = [];
    var arrValue = Array.isArray(value) ? value : [value];
    if (field.required && arrValue.length === 0) {
      errors.push(this._createError(field.name, 'required',
        this._getMessage(field, 'required'),
        field.severity));
    }
    if (field.minCount !== undefined && arrValue.length < field.minCount) {
      errors.push(this._createError(field.name, 'minCount',
        this._formatMessage(this._getMessage(field, 'minCount'), { minCount: field.minCount }),
        field.severity));
    }
    if (field.maxCount !== undefined && field.maxCount !== Infinity && arrValue.length > field.maxCount) {
      errors.push(this._createError(field.name, 'maxCount',
        this._formatMessage(this._getMessage(field, 'maxCount'), { maxCount: field.maxCount }),
        field.severity));
    }
    if (field.options && field.options.length > 0) {
      for (var i = 0; i < arrValue.length; i++) {
        if (field.options.indexOf(arrValue[i]) === -1) {
          errors.push(this._createError(field.name, 'invalidOption',
            '选项"' + arrValue[i] + '"不在可选范围内',
            field.severity));
          break;
        }
      }
    }
    return errors;
  };

  FormValidator.prototype._validateGeneric = function (field, value) {
    var errors = [];
    var strValue = String(value);
    if (field.minLength !== undefined && strValue.length < field.minLength) {
      errors.push(this._createError(field.name, 'minLength',
        '至少需要' + field.minLength + '个字符',
        field.severity));
    }
    if (field.maxLength !== undefined && strValue.length > field.maxLength) {
      errors.push(this._createError(field.name, 'maxLength',
        '不能超过' + field.maxLength + '个字符',
        field.severity));
    }
    if (field.pattern && !field.pattern.test(strValue)) {
      errors.push(this._createError(field.name, 'pattern',
        field.message && field.message.pattern || '格式不正确',
        field.severity));
    }
    if (field.min !== undefined && Number(value) < field.min) {
      errors.push(this._createError(field.name, 'min',
        '不能小于' + field.min,
        field.severity));
    }
    if (field.max !== undefined && Number(value) > field.max) {
      errors.push(this._createError(field.name, 'max',
        '不能大于' + field.max,
        field.severity));
    }
    return errors;
  };

  FormValidator.prototype._detectDuplicates = function (values) {
    var errors = [];
    var duplicateCheckFields = [];
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        if (this.fields[fieldName].unique && this._isFieldVisible(fieldName, values)) {
          duplicateCheckFields.push(fieldName);
        }
      }
    }
    var valueMap = {};
    for (var i = 0; i < duplicateCheckFields.length; i++) {
      var fn = duplicateCheckFields[i];
      var val = values[fn];
      if (!this._isEmpty(val)) {
        var valStr = String(val);
        if (!valueMap[valStr]) {
          valueMap[valStr] = [];
        }
        valueMap[valStr].push(fn);
      }
    }
    for (var valKey in valueMap) {
      if (valueMap.hasOwnProperty(valKey)) {
        if (valueMap[valKey].length > 1) {
          var fieldList = valueMap[valKey];
          for (var j = 0; j < fieldList.length; j++) {
            var fName = fieldList[j];
            var field = this.fields[fName];
            var dupMessage = field.message && field.message.unique
              ? field.message.unique
              : '该值与其他字段重复，请检查';
            errors.push(this._createError(fName, 'unique', dupMessage, field.severity));
          }
        }
      }
    }
    return errors;
  };

  FormValidator.prototype._isFieldVisible = function (fieldName, values) {
    var field = this.fields[fieldName];
    if (!field) return false;
    if (!field.visibleWhen) return true;
    if (typeof field.visibleWhen === 'function') {
      try {
        return field.visibleWhen(values, this.fields);
      } catch (e) {
        return true;
      }
    }
    if (typeof field.visibleWhen === 'object') {
      for (var depField in field.visibleWhen) {
        if (field.visibleWhen.hasOwnProperty(depField)) {
          var expected = field.visibleWhen[depField];
          var actual = values[depField];
          if (Array.isArray(expected)) {
            if (expected.indexOf(actual) === -1) {
              return false;
            }
          } else {
            if (actual !== expected) {
              return false;
            }
          }
        }
      }
      return true;
    }
    return true;
  };

  FormValidator.prototype._createError = function (field, rule, message, severity) {
    return {
      field: field,
      rule: rule,
      message: message,
      severity: severity || SEVERITY.ERROR,
      timestamp: Date.now()
    };
  };

  FormValidator.prototype._getMessage = function (field, rule) {
    if (field.message && field.message[rule]) {
      return field.message[rule];
    }
    if (BUILTIN_RULES[field.type] && BUILTIN_RULES[field.type].message && BUILTIN_RULES[field.type].message[rule]) {
      return BUILTIN_RULES[field.type].message[rule];
    }
    return '校验不通过';
  };

  FormValidator.prototype._formatMessage = function (message, params) {
    if (!message) return '';
    var result = message;
    for (var key in params) {
      if (params.hasOwnProperty(key)) {
        var regex = new RegExp('\\{' + key + '\\}', 'g');
        result = result.replace(regex, params[key]);
      }
    }
    return result;
  };

  FormValidator.prototype._getDatePattern = function (format) {
    switch (format) {
      case 'YYYY-MM-DD':
        return /^\d{4}-\d{2}-\d{2}$/;
      case 'YYYY/MM/DD':
        return /^\d{4}\/\d{2}\/\d{2}$/;
      case 'MM-DD-YYYY':
        return /^\d{2}-\d{2}-\d{4}$/;
      case 'DD-MM-YYYY':
        return /^\d{2}-\d{2}-\d{4}$/;
      default:
        return null;
    }
  };

  FormValidator.prototype._generateSuggestionText = function (error, field) {
    var suggestions = {
      required: '请填写' + field.label + '字段',
      pattern: '请检查' + field.label + '的格式是否正确',
      minLength: field.label + '内容太短，请补充更多信息',
      maxLength: field.label + '内容过长，请精简后重试',
      min: field.label + '数值太小，请增大数值',
      max: field.label + '数值太大，请减小数值',
      format: '请按照正确格式填写' + field.label,
      invalid: field.label + '无效，请重新输入',
      notExist: field.label + '不存在，请检查日期的月日是否正确',
      minCount: '请至少选择' + (field.minCount || 1) + '个' + field.label,
      maxCount: '最多只能选择' + field.maxCount + '个' + field.label,
      unique: field.label + '不能与其他字段重复，请修改',
      precision: field.label + '小数位数过多，请调整',
      hasLetter: field.label + '不能包含字母或文字，请只输入数字',
      multipleDots: field.label + '不能有多个小数点，请检查',
      hasSpace: field.label + '不能包含空格，请移除空格后重试',
      async: '请等待' + field.label + '校验完成'
    };
    return suggestions[error.rule] || '请修正' + field.label + '字段';
  };

  FormValidator.prototype._saveSummary = function (summary) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.summaryStorageKey, JSON.stringify(summary));
      }
    } catch (e) {}
  };

  FormValidator.prototype._loadSummary = function () {
    try {
      if (typeof localStorage !== 'undefined') {
        var data = localStorage.getItem(this.summaryStorageKey);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (e) {}
    return null;
  };

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    if (Array.isArray(obj)) {
      return obj.map(function (item) { return deepClone(item); });
    }
    var result = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = deepClone(obj[key]);
      }
    }
    return result;
  }

  function mergeDeep(target, source) {
    var output = deepClone(target);
    if (source && typeof source === 'object') {
      for (var key in source) {
        if (source.hasOwnProperty(key)) {
          if (source[key] instanceof RegExp) {
            output[key] = source[key];
          } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            output[key] = mergeDeep(output[key] || {}, source[key]);
          } else {
            output[key] = source[key];
          }
        }
      }
    }
    return output;
  }

  return FormValidator;
});
