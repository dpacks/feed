var fs = require('fs')
var prettyBytes = require('prettier-bytes')
var dPackLogger = require('@dpack/logger')
var output = require('@dpack/logger/result')
var DPack = require('@dpack/core')
var dwrem = require('@dwcore/rem')

module.exports = function (opts) {
  var usage = 'Usage: dpack-feed [key|dir] [--live,-l]'
  if (opts.help) {
    console.error(usage)
    process.exit()
  }

  var dPackLog = dPackLogger(view)
  dPackLog.use(function (state, bus) {
    state.opts = opts
    state.opts.thin = true
    state.opts.createIfMissing = false
    var dir = null
    if (opts._[0]) {
      try {
        if (fs.statSync(opts._[0]).isDirectory()) dir = opts._[0]
      } catch (e) {
        state.opts.key = opts._[0]
        dir = dwrem
      }
    } else {
      dir = process.cwd()
    }

    DPack(dir, state.opts, function (err, dpack) {
      if (err && err.name === 'MissingError') {
        bus.clear()
        console.error('No dPack found in', dir)
        console.error('')
        console.error(usage)
        process.exit(1)
      } else if (err) {
        console.error(err)
        process.exit(1)
      }

      state.dpack = dpack
      state.log = []
      state.puts = 0
      state.dels = 0
      bus.on('update', function () {
        state.verLen = state.dpack.vault.version.toString().length
        state.zeros = new Array(state.verLen).join('0')
      })
      bus.emit('render')

      dpack.trackStats()
      if (dpack.writable) {
        bus.emit('update')
        return run()
      }

      // var waitTimeout TODO
      state.offline = true

      dpack.joinNetwork(function () {
        if (!state.opts.live && state.offline && !dpack.network.connecting) exit()
      }).once('connection', function () {
        state.offline = false
        // clearTimeout(waitTimeout) // TODO: close if not live
      })
      dpack.vault.ready(function () {
        bus.emit('update')
      })
      dpack.vault.on('content', function () {
        bus.emit('update')
        dpack.vault.content.update()
      })

      if (!state.opts.live) {
        // wait for connections
        setTimeout(exit, 3000)
      }

      if (!state.opts.key) run()
      else dpack.vault.metadata.update(run)

      function run () {
        state.running = true
        var rs = dpack.vault.history({ live: state.opts.live || state.offline })
        rs.on('data', function (data) {
          var version = `${state.zeros.slice(0, state.verLen - data.version.toString().length)}${data.version}`
          var msg = `${version} [${data.type}] ${data.name}`
          if (data.type === 'put') {
            msg += ` ${prettyBytes(data.value.size)} (${data.value.blocks} ${data.value.blocks === 1 ? 'block' : 'blocks'})`
            state.puts++
          } else {
            state.dels++
          }
          state.log.push(msg)
          bus.emit('render')
        })
      }

      function exit () {
        state.exiting = true
        bus.render()
        process.exit(0)
      }
    })
  })

  function view (state) {
    if (!state.running) {
      if (state.opts.key) return 'Connecting to the dWeb network...'
      return 'Reading dPack history...'
    }
    return output`
      ${state.log.join('\n')}
      ${state.offline
          ? state.exiting
            ? '\nNo sources found in network.\nLog may be outdated.'
            : '...\n\nConnecting to network to update & verify log...'
          : '\nLog synced with network'}

      Vault has ${state.dpack.vault.version} changes (puts: +${state.puts}, dels: -${state.dels})
      Current Size: ${prettyBytes(state.dpack.stats.get().byteLength)}
      Total Size:
      - Metadata ${prettyBytes(state.dpack.vault.metadata.byteLength)}
      - Content ${prettyBytes(state.dpack.vault.content.byteLength)}
      Blocks:
      - Metadata ${state.dpack.vault.metadata.length}
      - Content ${state.dpack.vault.content.length}
    `
  }
}
