#!/usr/bin/env node

var minimist = require('minimist')
var dpackLog = require('.')

dpackLog(minimist(process.argv.slice(2), {
  alias: { live: 'l', help: 'h' }, boolean: [ 'live', 'help' ]
}))
