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

const extendWordList = (oldList, chars, suffix = '') => {
  let newList = []
  for (let v of oldList) {
    for (let c of chars) {
      let vv = v + c
      if (suffix !== '') { // the final
        if (vv.startsWith('-')) {
          continue
        }
        if (vv.endsWith('-')) {
          continue
        }
        if (vv.indexOf('--') > -1) {
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
  let domainKey = 'Domain Name'
  let domainKeyFound = false

  let isEndLine = false
  let endLinePrefix = '>>>'
  let sep = ':'

  for (let row of str.split('\n')) {
    let sepIndex = row.indexOf(sep)
    let key = ''
    let value = row.trim() // trim \r
    if (sepIndex > -1) {
      key = row.substr(0, sepIndex).trim()
      if (key === domainKey) {
        domainKeyFound = true
      }
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
  if (!domainKeyFound) {
    if (options.lowercase) {
      domainKey = domainKey.toLowerCase()
    }
    if (options.nested) {
      domainKey = domainKey.replace(/ /g, '.')
    }
    _.set(o, domainKey, domain)
  }
  return o
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
const buildExcludeList = (str, domainKey) => {
  let list = []
  parseBulkJson(str, json => {
    if (json.hasOwnProperty(domainKey)) {
      list.push(json[domainKey])
    }
  })
  return list
}
const loadExcludeFile = async (path) => {
  let str = await readFile(path, 'utf8')
  return buildExcludeList(str, 'domain')
}
const loadExcludeFiles = async pathList => {
  let jobs = []
  for (let path of pathList) {
    jobs.push(loadExcludeFile(path))
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

;(async () => {
  const options = yargs.argv
  let list = []
  if (options.domain) {
    list = options.domain
  } else {
    if (!options.chars) {
      let az = 'abcdefghijklmnopqrstuvwxyz'
      let num = '0123456789'
      switch (options['chars-group']) {
        case 'a-z0-9-':
          options.chars = az + num + '-'
          break
        case 'a-z0-9':
          options.chars = az + num
          break
        case 'a-z-':
          options.chars = az + '-'
          break
        case 'a-z':
          options.chars = az
          break
        case '0-9-':
          options.chars = num + '-'
          break
        case '0-9':
          options.chars = num
          break
        default:
          options.chars = options['chars-group']
      }
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
      if (verbose) {
        console.log('[start]', domain)
      }
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
        default:
          let data = await whois(domain, methodOptions)
          console.log(JSON.stringify(parseWhois(domain, data)))
      }
      if (verbose) {
        console.log('[done]', domain)
      }
    } catch (e) {
      if (verbose) {
        console.error('[fail]', domain, e.message)
      }
    }
  }
  const runAll = async (list) => {
    let domainStartFrom = list[0]
    if (options['domain-from']) {
      domainStartFrom = options['domain-from']
    }
    let excludeList = []
    if (options['domain-exclude-file']) {
      excludeList = await loadExcludeFiles(options['domain-exclude-file'])
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
        if (excludeList.includes(domain)) {
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

  if (options.verbose) {
    let used = process.memoryUsage()
    for (let key in used) {
      console.log('[mem]', `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`)
    }
  }
})()
