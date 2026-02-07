console.log('Script started');
console.log('process.type:', process.type);

// This is the key - when Electron loads a main process, it sets up internal bindings
// Let's check if we have access to the internal Electron module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    console.log('Electron require intercepted');
    console.log('this:', this.id);
  }
  return originalRequire.apply(this, arguments);
};

const electron = require('electron');
console.log('electron after intercept:', typeof electron);
