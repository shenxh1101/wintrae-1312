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
        invalid: '请输入有效的日期'
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
        min: '金额不能小于0.01元',
        max: '金额不能超过99,999,999.99元',
        precision: '金额最多保留2位小数',
        pattern: '请输入有效的数字金额'
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
        minLength: '地址至少需要5个字符',
        maxLength: '地址不能超过200个字符'
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
    this.lastSummary = null;
    this.summaryStorageKey = options.summaryStorageKey || 'form_validator_last_summary';
    this.customRules = {};
    this.onFieldValidate = options.onFieldValidate || null;
    this.onFormValidate = options.onFormValidate || null;
    this.locale = options.locale || 'zh-CN';
    this.enableSummaryPersistence = options.enableSummaryPersistence !== false;
  }

  FormValidator.SEVERITY = SEVERITY;
  FormValidator.BUILTIN_RULES = BUILTIN_RULES;

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
      if (field.customRules && field.customRules.length > 0) {
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
      if (field.validator && typeof field.validator === 'function') {
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
              } else { errors.push(err); }
            }
          }
        } catch (e) {
          errors.push(this._createError(fieldName, 'custom', '校验异常：' + e.message, SEVERITY.ERROR));
        }
      }
    }
    this.errors[fieldName] = errors;
    this.warnings[fieldName] = warnings;
    var result = {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      field: fieldName,
      value: value,
      timestamp: Date.now()
    };
    if (this.onFieldValidate && typeof this.onFieldValidate === 'function') {
      this.onFieldValidate(result);
    }
    return result;
  };

  FormValidator.prototype.validateAll = function (values) {
    var allErrors = [];
    var allWarnings = [];
    var fieldResults = {};
    var hasError = false;
    var fieldsToValidate = [];
    for (var fieldName in this.fields) {
      if (this.fields.hasOwnProperty(fieldName)) {
        if (this._isFieldVisible(fieldName, values || this.fieldValues)) {
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
    var duplicateErrors = this._detectDuplicates(values || this.fieldValues);
    allErrors = allErrors.concat(duplicateErrors);
    if (duplicateErrors.length > 0) {
      hasError = true;
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

  FormValidator.prototype.getAllErrors = function () {
    var allErrors = [];
    for (var fieldName in this.errors) {
      if (this.errors.hasOwnProperty(fieldName)) {
        allErrors = allErrors.concat(this.errors[fieldName]);
      }
    }
    return allErrors;
  };

  FormValidator.prototype.getAllWarnings = function () {
    var allWarnings = [];
    for (var fieldName in this.warnings) {
      if (this.warnings.hasOwnProperty(fieldName)) {
        allWarnings = allWarnings.concat(this.warnings[fieldName]);
      }
    }
    return allWarnings;
  };

  FormValidator.prototype.getFirstError = function () {
    var errors = this.getAllErrors();
    return errors.length > 0 ? errors[0] : null;
  };

  FormValidator.prototype.clearFieldStatus = function (fieldName) {
    if (fieldName) {
      this.errors[fieldName] = [];
      this.warnings[fieldName] = [];
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
    }
    return this;
  };

  FormValidator.prototype.clearAllStatus = function () {
    return this.clearFieldStatus();
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
            var r = this.validateField(fieldName, value);
            if (!r.valid) {
              isIncomplete = true;
            }
          }
          if (isIncomplete) {
            incomplete.push({
              field: fieldName,
              label: field.label,
              errors: this.errors[fieldName] || [],
              isEmpty: this._isEmpty(value)
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
        severity: error.severity
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

  FormValidator.prototype.reset = function () {
    this.fields = {};
    this.errors = {};
    this.warnings = {};
    this.groups = {};
    this.fieldValues = {};
    this.lastSummary = null;
    this.customRules = {};
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
    var dateObj = new Date(strValue);
    if (isNaN(dateObj.getTime())) {
      errors.push(this._createError(field.name, 'invalid',
        this._getMessage(field, 'invalid'),
        field.severity));
    }
    if (field.minDate) {
      var minDate = new Date(field.minDate);
      if (dateObj < minDate) {
        errors.push(this._createError(field.name, 'minDate',
          '日期不能早于' + field.minDate,
          field.severity));
      }
    }
    if (field.maxDate) {
      var maxDate = new Date(field.maxDate);
      if (dateObj > maxDate) {
        errors.push(this._createError(field.name, 'maxDate',
          '日期不能晚于' + field.maxDate,
          field.severity));
      }
    }
    return errors;
  };

  FormValidator.prototype._validateAmount = function (field, value) {
    var errors = [];
    var numValue = parseFloat(value);
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
      var strVal = String(value);
      var decimalIndex = strVal.indexOf('.');
      if (decimalIndex !== -1 && strVal.slice(decimalIndex + 1).length > field.precision) {
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
        if (this.fields[fieldName].unique) {
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
      minCount: '请至少选择' + (field.minCount || 1) + '个' + field.label,
      maxCount: '最多只能选择' + field.maxCount + '个' + field.label,
      unique: field.label + '不能与其他字段重复，请修改',
      precision: field.label + '小数位数过多，请调整'
    };
    return suggestions[error.rule] || '请修正' + field.label + '字段';
  };

  FormValidator.prototype._saveSummary = function (summary) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.summaryStorageKey, JSON.stringify(summary));
      }
    } catch (e) {
    }
  };

  FormValidator.prototype._loadSummary = function () {
    try {
      if (typeof localStorage !== 'undefined') {
        var data = localStorage.getItem(this.summaryStorageKey);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (e) {
    }
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
