#!/usr/bin/env node
const fs = require('fs')
const util = require('util')
const readFile = util.promisify(fs.readFile)

const yargs = require('yargs')
const _ = require('lodash')
const _whois = require('whois')
const whois = (domain, options) => {
  return new Promise((resolve, reject) => {
    _whois.lookup(domain, options, function (err, data) {
      if (err) { return reject(err) }
      resolve(data)
    })
  })
}
const http = require('http')
const curl = (hostname, options = {
  method: 'head'
}) => new Promise((resolve, reject) => {
  let req = http.request({hostname, method: options.method}, res => {
    res.on('data', () => {}) // must set the 'data' event, otherwise won't resolve
    res.on('end', () => resolve(res))
  })
  req.on('error', reject)
  req.end()
})

const isValidDomainPart = domain => {
  if (domain.startsWith('-')) {
    return false
  }
  if (domain.endsWith('-')) {
    return false
  }
  if (domain.indexOf('--') > -1) {
    return false
  }
  return true
}
const isValidDomain = domain => {
  let list = domain.split('.')
  for (let part of list) {
    if (!isValidDomainPart(part)) {
      return false
    }
  }
  return true
}
const extendWordList = (oldList, chars, suffix = '') => {
  let newList = []
  for (let v of oldList) {
    for (let c of chars) {
      let vv = v + c
      if (suffix !== '') { // the final
        if (!isValidDomainPart(vv)) {
          continue
        }
        vv += suffix
      }
      newList.push(vv)
    }
  }
  return newList
}
const buildWordList = (chars, length, suffix = '') => {
  switch (length) {
    case 0: return []
    case 1: return chars.split('').map(char => char + suffix)
    default:
      let list = chars.split('')
      for (let i = 2; i <= length; i++) {
        if (i === length) {
          list = extendWordList(list, chars, suffix)
        } else {
          list = extendWordList(list, chars)
        }
      }
      return list
  }
}
const parseWhois = (domain, str, options = {
  lowercase: false,
  nested: false
}) => {
  let o = {}
  let isEndLine = false
  let endLinePrefix = '>>>'
  let sep = ':'

  for (let row of str.split('\n')) {
    let sepIndex = row.indexOf(sep)
    let key = ''
    let value = row.trim() // trim \r
    if (sepIndex > -1) {
      key = row.substr(0, sepIndex).trim()
      value = row.substr(sepIndex + sep.length).trim()
      if (key.substr(0, endLinePrefix.length) === endLinePrefix) {
        isEndLine = true

        key = key.substr(endLinePrefix.length).trim()
        value = value.substr(0, value.length - '<<<'.length).trim()
      }
      if (options.lowercase) {
        key = key.toLowerCase()
      }
      if (options.nested) {
        key = key.replace(/ /g, '.')
      }
    }
    let v = _.get(o, key)
    if (v) {
      if (!Array.isArray(v)) {
        v = [v]
      }
      v.push(value)
      _.set(o, key, v)
    } else {
      _.set(o, key, value)
    }
    if (isEndLine) {
      break
    }
  }
  _.set(o, 'domain', domain)
  return o
}
const formatChars = (group) => {
  let az = 'abcdefghijklmnopqrstuvwxyz'
  let num = '0123456789'
  switch (group) {
    case 'a-z0-9-':
      return az + num + '-'
    case 'a-z0-9':
      return az + num
    case 'a-z-':
      return az + '-'
    case 'a-z':
      return az
    case '0-9-':
      return num + '-'
    case '0-9':
      return num
    default:
      return group
  }
}
const parseBulkJson = (str, mapCallback) => {
  for (let row of str.split('\n')) {
    row = row.trim()
    try {
      let json = JSON.parse(row)
      mapCallback(json)
    } catch (e) {}
  }
}
const buildDomainList = (str, domainKey) => {
  let list = []
  parseBulkJson(str, json => {
    if (json.hasOwnProperty(domainKey)) {
      list.push(json[domainKey])
    }
  })
  return list
}
const loadDomainJsonBulkFile = async (path) => {
  let str = await readFile(path, 'utf8')
  return buildDomainList(str, 'domain')
}
const loadDomainJsonBulkFiles = async pathList => {
  let jobs = []
  for (let path of pathList) {
    jobs.push(loadDomainJsonBulkFile(path))
  }
  let rawList = await Promise.all(jobs)
  return rawList.reduce((accumulator, list) => accumulator.concat(list), [])
}

yargs
  .usage('Usage: $0 [options]')
  .help('h')
  .alias('h', 'help')
  .option('verbose', {
    describe: 'verbose',
    alias: 'v',
    type: 'boolean',
    default: false
  })
  .option('method', {
    describe: 'method',
    type: 'string',
    default: 'whois',
    choices: [
      'http',
      'curl',
      'whois'
    ]
  })
  .option('domain', {
    describe: 'domain',
    type: 'array'
  })
  .option('domain-file', {
    describe: 'domain-file',
    type: 'array'
  })
  .option('domain-from', {
    describe: 'domain-from',
    type: 'string'
  })
  .option('domain-exclude-file', {
    describe: 'domain-exclude',
    type: 'array'
  })
  .option('domain-suffix', {
    describe: 'domain-suffix',
    type: 'array',
    default: '.app'
  })
  .option('chars', {
    describe: 'chars',
    type: 'string'
  })
  .option('chars-group', {
    describe: 'chars-group',
    type: 'string',
    default: '0',
    choices: [
      'a-z0-9-',
      'a-z0-9',
      'a-z-',
      'a-z',
      '0-9-',
      '0-9',
      '0'
    ]
  })
  .option('length', {
    describe: 'length',
    type: 'number',
    default: 3
  })
  .option('proxy', {
    describe: 'proxy',
    type: 'string'
  })
  .option('max-request', {
    describe: 'max-request',
    type: 'number',
    default: 1000
  })
  .option('whois-server', {
    describe: 'whois-server',
    type: 'string'
  })
const options = yargs.argv
const log = (...args) => {
  if (options.verbose) {
    console.log(...args)
  }
}
const error = (...args) => {
  if (options.verbose) {
    console.error(...args)
  }
}

;(async () => {
  let list = []
  if (options.domain) {
    list = options.domain
  } else if (options['domain-file']) {
    list = await loadDomainJsonBulkFiles(options['domain-file'])
  } else {
    if (!options.chars) {
      options.chars = formatChars(options['chars-group'])
    }
    for (let suffix of options['domain-suffix']) {
      list = list.concat(buildWordList(options.chars, options.length, suffix))
    }
  }

  let whoisOptions = {}
  if (options['whois-server']) {
    whoisOptions.server = options['whois-server']
  } else if (options['domain-suffix'].includes('.app')) {
    whoisOptions.server = 'whois.nic.google'
  }
  if (options.proxy) {
    let url = new URL(options.proxy)
    let allowedProtocol = [
      'socks5:',
      'socks4:'
    ]
    if (url.protocol) {
      if (!allowedProtocol.includes(url.protocol)) {
        throw new Error(`Invalid proxy protocol (${url.protocol}), should be one of ${allowedProtocol.join(', ')}`)
      }
    } else {
      url.protocol = 'socks5'
    }
    whoisOptions.proxy = {
      ipaddress: url.hostname,
      port: parseInt(url.port),
      type: parseInt(url.protocol.substr(5, 1))
    }
  }

  const runOnce = async (domain, method = 'whois', methodOptions, verbose) => {
    try {
      log('[start]', domain)
      switch (method) {
        case 'http':
        case 'curl':
          try {
            let res = await curl(domain)
            console.log(JSON.stringify({
              domain,
              statusCode: res.statusCode,
              method: res.req.method
            }))
          } catch (e) {
            console.error(JSON.stringify({
              domain,
              error: e.message
            }))
            throw e
          }
          break
        case 'whois':
          try {
            let rawData = await whois(domain, methodOptions)
            let data = parseWhois(domain, rawData)
            if (
              data.hasOwnProperty('DNSSEC') ||
              data.hasOwnProperty('dnssec')
            ) {
              console.log(JSON.stringify(data))
            } else {
              console.error(JSON.stringify(data))
            }
          } catch (e) {
            console.error(JSON.stringify({
              domain,
              error: e.message
            }))
            throw e
          }
          break
        default:
          throw new Error('Invalid method')
      }
      log('[done]', domain)
    } catch (e) {
      error('[fail]', domain, e.message)
    }
  }
  const runAll = async (list) => {
    let domainStartFrom = list[0]
    if (options['domain-from']) {
      domainStartFrom = options['domain-from']
    }
    let excludeList = []
    if (options['domain-exclude-file']) {
      excludeList = await loadDomainJsonBulkFiles(options['domain-exclude-file'])
    }
    let start = false
    const runBatch = async (list) => {
      let jobs = []
      for (let domain of list) {
        if (domainStartFrom && domain === domainStartFrom) {
          start = true
        }
        if (!start) {
          continue
        }
        if (!isValidDomain(domain)) {
          log('[ignore]', domain)
          continue
        }
        if (excludeList.includes(domain)) {
          log('[ignore]', domain)
          continue
        }
        jobs.push(runOnce(domain, options.method, whoisOptions, options.verbose))
      }
      await Promise.all(jobs)
    }
    while (list.length > 0) {
      let tempList = list.splice(0, options['max-request'])
      await runBatch(tempList)
    }
  }

  await runAll(list)

  let used = process.memoryUsage()
  for (let key in used) {
    log('[mem]', `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`)
  }
})()
