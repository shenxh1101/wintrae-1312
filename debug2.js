var FormValidator = require('./form-validator.js');

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

var incomplete = submitValidator.getIncompleteByGroup({
  name: '张三',
  phone: '',
  address: '',
  email: 'invalid-email'
});

console.log('contact group:');
console.log('  count:', incomplete.contact.count);
console.log('  fields:');
for (var i = 0; i < incomplete.contact.fields.length; i++) {
  console.log('    -', incomplete.contact.fields[i].field,
    'isEmpty:', incomplete.contact.fields[i].isEmpty,
    'errors:', incomplete.contact.fields[i].errors.length);
}

console.log('\naddress errors:', submitValidator.getFieldErrors('address'));
console.log('email errors:', submitValidator.getFieldErrors('email'));
